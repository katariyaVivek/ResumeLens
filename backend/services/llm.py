import sys

sys.dont_write_bytecode = True

import logging
import os
from typing import Optional, List, Dict, AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_TEMPERATURE = 0.1

API_BASE_MAP = {
    "groq": "https://api.groq.com/openai/v1",
    "azure": None,
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "ollama": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
}

API_KEY_ENV_MAP = {
    "groq": "GROQ_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "ollama": None,
}


def _parse_model(model: str, api_base: Optional[str]) -> tuple[str, str, str]:
    if "/" in model:
        provider, _, _ = model.partition("/")
        base = api_base or API_BASE_MAP.get(provider, "")
        return model, base, provider
    return model, api_base or "", ""


class LLMService:
    def __init__(
        self,
        model: str = "gpt-4o-mini",
        api_key: Optional[str] = None,
        provider: str = "auto",
        api_base: Optional[str] = None,
        temperature: float = DEFAULT_TEMPERATURE,
    ):
        self.raw_model = model
        self.model, resolved_base, detected_provider = _parse_model(model, api_base)
        self.api_base = resolved_base
        self.temperature = temperature

        if api_key:
            self.api_key = api_key
        else:
            env_var = API_KEY_ENV_MAP.get(detected_provider)
            self.api_key = os.getenv(env_var, "") if env_var else ""

    async def _post(self, endpoint: str, body: dict) -> httpx.Response:
        async with httpx.AsyncClient(timeout=60.0) as client:
            return await client.post(
                endpoint,
                json=body,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )

    async def _stream(self, endpoint: str, body: dict):
        client = httpx.AsyncClient(timeout=httpx.Timeout(120.0))
        async with client.stream(
            "POST",
            endpoint,
            json=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        ) as response:
            async for line in response.aiter_lines():
                yield line

    async def generate_subquestions(self, question: str) -> List[str]:
        system_message = {
            "role": "system",
            "content": """You are an expert in talent acquisition. Separate this job description into 3-4 more focused aspects for efficient resume retrieval. 
Make sure every single relevant aspect of the query is covered in at least one query. You may choose to remove irrelevant information that doesn't contribute to finding resumes such as the expected salary of the job, the ID of the job, the duration of the contract, etc.
Only use the information provided in the initial query. Do not make up any requirements of your own.
Put each result in one line, separated by a linebreak.""",
        }

        user_message = {
            "role": "user",
            "content": f"Generate 3 to 4 sub-queries based on this initial job description:\n\n{question}",
        }

        try:
            endpoint = f"{self.api_base}/chat/completions"
            response = await self._post(
                endpoint,
                {
                    "model": self.model,
                    "messages": [system_message, user_message],
                    "temperature": self.temperature,
                },
            )
            data = response.json()
            content = data["choices"][0]["message"]["content"] or ""
            return [line.strip() for line in content.split("\n") if line.strip()]
        except Exception as e:
            logger.error(f"Failed to generate subquestions: {e}")
            return []

    async def generate_response(
        self,
        query: str,
        documents: List[str],
        query_type: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        context = "\n\n".join(doc for doc in documents)

        if query_type == "retrieve_applicant_jd":
            system_message = {
                "role": "system",
                "content": """You are an expert talent acquisition specialist. Analyze the provided resumes against the job description and present your findings clearly.

FORMAT RULES — follow exactly:
1. For each relevant candidate, create a section starting with ## followed by the candidate name
2. Under each name, list their key attributes using bullet points with bold labels:
   - **Role:** their current/most recent title
   - **Experience:** years and key areas
   - **Skills:** top 5-8 relevant skills, comma-separated
   - **Highlights:** 1-2 standout achievements
3. After all candidates, add a ## Best Match section with a 2-3 sentence recommendation explaining why
4. If a candidate is a weak match, briefly note why under their section
5. Keep responses concise — max 5 candidates. Focus on quality over quantity.

Example:
## Priya Sharma
- **Role:** Senior Backend Developer
- **Experience:** 7 years in backend development
- **Skills:** Python, Django, PostgreSQL, AWS, Docker, Kubernetes
- **Highlights:** Built payment processing systems at a fintech startup

## Best Match
Priya Sharma is the strongest fit due to her 7 years of Python/Django experience and cloud deployment expertise.""",
            }
        else:
            system_message = {
                "role": "system",
                "content": """You are an expert talent acquisition specialist. Analyze the provided resumes and present findings clearly.

FORMAT RULES — follow exactly:
1. Create clear sections using ## headings for each topic
2. Use bullet points with bold labels for structured information:
   - **Role:** title or position
   - **Experience:** years and domains
   - **Skills:** key technologies
   - **Highlights:** notable achievements
3. Keep responses concise and scannable
4. If comparing candidates, present side by side with clear differences noted
5. End with a brief recommendation if relevant""",
            }

        messages = [system_message]

        if chat_history:
            for msg in chat_history:
                messages.append(msg)

        if query_type == "retrieve_applicant_jd":
            messages.append(
                {
                    "role": "user",
                    "content": f"Context: {context}\n\nQuestion: {query}",
                }
            )
        else:
            messages.append(
                {
                    "role": "user",
                    "content": f"Chat history: {chat_history}\n\nQuestion: {query}\n\nContext: {context}",
                }
            )

        try:
            endpoint = f"{self.api_base}/chat/completions"
            response = await self._post(
                endpoint,
                {
                    "model": self.model,
                    "messages": messages,
                    "temperature": self.temperature,
                },
            )
            data = response.json()
            return data["choices"][0]["message"]["content"] or ""
        except Exception as e:
            logger.error(f"Failed to generate response: {e}")
            return (
                "I apologize, but I encountered an error while generating a response."
            )

    async def generate_response_stream(
        self,
        query: str,
        documents: List[str],
        query_type: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncGenerator[str, None]:
        context = "\n\n".join(doc for doc in documents)

        if query_type == "retrieve_applicant_jd":
            system_message = {
                "role": "system",
                "content": """You are an expert talent acquisition specialist. Analyze the provided resumes against the job description and present your findings clearly.

FORMAT RULES — follow exactly:
1. For each relevant candidate, create a section starting with ## followed by the candidate name
2. Under each name, list their key attributes using bullet points with bold labels:
   - **Role:** their current/most recent title
   - **Experience:** years and key areas
   - **Skills:** top 5-8 relevant skills, comma-separated
   - **Highlights:** 1-2 standout achievements
3. After all candidates, add a ## Best Match section with a 2-3 sentence recommendation explaining why
4. If a candidate is a weak match, briefly note why under their section
5. Keep responses concise — max 5 candidates. Focus on quality over quantity.

Example:
## Priya Sharma
- **Role:** Senior Backend Developer
- **Experience:** 7 years in backend development
- **Skills:** Python, Django, PostgreSQL, AWS, Docker, Kubernetes
- **Highlights:** Built payment processing systems at a fintech startup

## Best Match
Priya Sharma is the strongest fit due to her 7 years of Python/Django experience and cloud deployment expertise.""",
            }
        else:
            system_message = {
                "role": "system",
                "content": """You are an expert talent acquisition specialist. Analyze the provided resumes and present findings clearly.

FORMAT RULES — follow exactly:
1. Create clear sections using ## headings for each topic
2. Use bullet points with bold labels for structured information:
   - **Role:** title or position
   - **Experience:** years and domains
   - **Skills:** key technologies
   - **Highlights:** notable achievements
3. Keep responses concise and scannable
4. If comparing candidates, present side by side with clear differences noted
5. End with a brief recommendation if relevant""",
            }

        messages = [system_message]

        if chat_history:
            for msg in chat_history:
                messages.append(msg)

        if query_type == "retrieve_applicant_jd":
            messages.append(
                {
                    "role": "user",
                    "content": f"Context: {context}\n\nQuestion: {query}",
                }
            )
        else:
            messages.append(
                {
                    "role": "user",
                    "content": f"Chat history: {chat_history}\n\nQuestion: {query}\n\nContext: {context}",
                }
            )

        try:
            endpoint = f"{self.api_base}/chat/completions"
            import json

            body = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature,
                "stream": True,
            }

            got_content = False
            async for line in self._stream(endpoint, body):
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    chunk_data = json.loads(data)
                    content = chunk_data["choices"][0]["delta"].get("content")
                    if content:
                        got_content = True
                        yield content
                elif line.strip().startswith("{"):
                    err = json.loads(line)
                    msg = err.get("error", {}).get("message", "Unknown API error")
                    logger.error(f"API error: {msg}")
                    yield f"API Error: {msg}"
                    got_content = True

            if not got_content:
                yield "No response from the model. Check your API key and base URL."
        except Exception as e:
            logger.error(f"Failed to generate streaming response: {e}")
            yield "I apologize, but I encountered an error while generating a response."
