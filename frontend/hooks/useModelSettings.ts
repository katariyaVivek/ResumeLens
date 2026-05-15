import { useEffect, useRef, useState } from "react";

import { fetchModels, wakeUp } from "@/lib/api";
import { PROVIDER_PRESETS, type ProviderPreset } from "@/lib/chat-config";

interface ModelSettingsState {
  apiKey: string;
  setApiKey: (value: string) => void;
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  modelName: string;
  setModelName: (value: string) => void;
  showKey: boolean;
  setShowKey: (value: boolean) => void;
  selectedProvider: string;
  selectProvider: (provider: ProviderPreset) => void;
  showModels: boolean;
  setShowModels: (value: boolean) => void;
  fetchedModels: string[];
  loadingModels: boolean;
  modelFetchError: string;
}

export function useModelSettings(): ModelSettingsState {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS[0].baseUrl);
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [showKey, setShowKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(PROVIDER_PRESETS[0].label);
  const [showModels, setShowModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState("");
  const modelNameRef = useRef(modelName);

  useEffect(() => {
    modelNameRef.current = modelName;
  }, [modelName]);

  useEffect(() => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      setFetchedModels([]);
      setLoadingModels(false);
      setModelFetchError("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingModels(true);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (cancelled) return;

        if (attempt > 0) {
          await wakeUp();
          await new Promise((resolve) => {
            window.setTimeout(resolve, 3000);
          });
        }

        const result = await fetchModels(apiKey, baseUrl);

        if (cancelled) return;

        if (result.models.length > 0) {
          setFetchedModels(result.models);
          setModelFetchError("");

          if (!result.models.includes(modelNameRef.current)) {
            setModelName(result.models[0]);
          }

          setLoadingModels(false);
          return;
        }

        if (result.error) {
          setModelFetchError(result.error);
        }
      }

      if (!cancelled) {
        setFetchedModels([]);
        setLoadingModels(false);
        setModelFetchError((previous) => previous || "No chat models found.");
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, baseUrl]);

  const selectProvider = (provider: ProviderPreset) => {
    setSelectedProvider(provider.label);
    setBaseUrl(provider.baseUrl);
    setShowModels(false);
    setModelFetchError("");
  };

  return {
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    modelName,
    setModelName,
    showKey,
    setShowKey,
    selectedProvider,
    selectProvider,
    showModels,
    setShowModels,
    fetchedModels,
    loadingModels,
    modelFetchError,
  };
}
