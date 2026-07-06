import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_USER_SETTINGS,
  fetchUserSettings,
  getCachedSettings,
  normalizeUserSettings,
  saveUserSettings,
  clearCachedSettings,
} from "../utils/userSettings";

const UserSettingsContext = createContext(null);

const API = process.env.REACT_APP_API_BASE_URL ?? "";

export function UserSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => getCachedSettings());
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setSettings({ ...DEFAULT_USER_SETTINGS });
      setLoading(false);
      return DEFAULT_USER_SETTINGS;
    }

    try {
      const data = await fetchUserSettings(API);
      setSettings(data);
      return data;
    } catch (err) {
      console.error("Settings load failed:", err);
      const cached = getCachedSettings();
      setSettings(cached);
      return cached;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
    const handler = () => refreshSettings();
    window.addEventListener("auth-changed", handler);
    return () => window.removeEventListener("auth-changed", handler);
  }, [refreshSettings]);

  const updateSettings = useCallback(async (partial) => {
    const next = normalizeUserSettings({ ...settings, ...partial });
    const saved = await saveUserSettings(API, next);
    setSettings(saved);
    return saved;
  }, [settings]);

  const resetSettings = useCallback(() => {
    clearCachedSettings();
    setSettings({ ...DEFAULT_USER_SETTINGS });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loading,
      refreshSettings,
      updateSettings,
      resetSettings,
    }),
    [settings, loading, refreshSettings, updateSettings, resetSettings]
  );

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return ctx;
}
