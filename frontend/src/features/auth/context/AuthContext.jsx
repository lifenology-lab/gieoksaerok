import { useCallback, useEffect, useMemo, useState } from "react";

import { clearAuthTokens, getAccessToken } from "../../../shared/api/authTokens";
import { clearDemoExperienceMode } from "../../../shared/demo/demoExperienceMode";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  signUpUser,
  startDemoExperience,
} from "../api/authApi";
import { AuthContext } from "./authContextValue";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasPassedLoginPage, setHasPassedLoginPage] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      if (!getAccessToken()) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const currentUser = await fetchCurrentUser();

        if (isMounted) {
          setUser(currentUser);
          setHasPassedLoginPage(true);
        }
      } catch (error) {
        console.error("Session restore error:", error);
        clearAuthTokens();
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = useCallback(async ({ username, password }) => {
    clearDemoExperienceMode();
    const data = await loginUser({ username, password });
    const currentUser = data.user || (await fetchCurrentUser());
    setUser(currentUser);
    setHasPassedLoginPage(true);
    return currentUser;
  }, []);

  const signUpAndSignIn = useCallback(
    async ({ username, password, name, email }) => {
      await signUpUser({ username, password, name, email });
      return signIn({ username, password });
    },
    [signIn],
  );

  const beginDemoExperience = useCallback(async () => {
    const data = await startDemoExperience();
    const currentUser = data.user || (await fetchCurrentUser());

    setUser(currentUser);
    setHasPassedLoginPage(true);
    return currentUser;
  }, []);

  const signOut = useCallback(async () => {
    await logoutUser();
    clearDemoExperienceMode();
    setUser(null);
    setHasPassedLoginPage(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isCheckingSession,
      hasPassedLoginPage,
      beginDemoExperience,
      signIn,
      signOut,
      signUpAndSignIn,
    }),
    [
      hasPassedLoginPage,
      beginDemoExperience,
      isCheckingSession,
      signIn,
      signOut,
      signUpAndSignIn,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
