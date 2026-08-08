import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../features/auth/context/authContextValue";

import "./AuthPage.css";

function getRedirectPath(location) {
  const fromPath = location.state?.from?.pathname;

  if (!fromPath || fromPath === "/") {
    return "/roles";
  }

  return fromPath;
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUpAndSignIn } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isSignUpMode = mode === "signup";

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setErrorMessage("");
  };

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setErrorMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      if (isSignUpMode) {
        await signUpAndSignIn({
          username: form.username.trim(),
          password: form.password,
          name: form.name.trim(),
          email: form.email.trim(),
        });
      } else {
        await signIn({
          username: form.username.trim(),
          password: form.password,
        });
      }

      navigate(getRedirectPath(location), { replace: true });
    } catch (error) {
      setErrorMessage(
        error?.message ||
          (isSignUpMode
            ? "회원가입 중 문제가 발생했어요."
            : "로그인 중 문제가 발생했어요."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section
        className={`auth-page__panel ${
          isSignUpMode ? "auth-page__panel--signup" : "auth-page__panel--login"
        }`}
      >
        <div className="auth-page__intro">
          <p className="auth-page__eyebrow">기억새록</p>
          <h1>{isSignUpMode ? "회원가입" : "로그인"}</h1>
        </div>

        <div className="auth-page__tabs" role="tablist" aria-label="인증 방식">
          <button
            type="button"
            className={!isSignUpMode ? "is-active" : ""}
            aria-selected={!isSignUpMode}
            onClick={() => handleModeChange("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={isSignUpMode ? "is-active" : ""}
            aria-selected={isSignUpMode}
            onClick={() => handleModeChange("signup")}
          >
            회원가입
          </button>
        </div>

        <form className="auth-page__form" onSubmit={handleSubmit}>
          {isSignUpMode && (
            <>
              <label>
                <span>이름</span>
                <input
                  autoComplete="name"
                  name="name"
                  placeholder="환자 이름"
                  value={form.name}
                  onChange={handleChange}
                />
              </label>

              <label>
                <span>이메일</span>
                <input
                  autoComplete="email"
                  name="email"
                  placeholder="email@example.com"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                />
              </label>
            </>
          )}

          <label>
            <span>아이디</span>
            <input
              autoComplete="username"
              name="username"
              placeholder="로그인 아이디"
              required
              value={form.username}
              onChange={handleChange}
            />
          </label>

          <label>
            <span>비밀번호</span>
            <input
              autoComplete={isSignUpMode ? "new-password" : "current-password"}
              minLength={8}
              name="password"
              placeholder="8자 이상"
              required
              type="password"
              value={form.password}
              onChange={handleChange}
            />
          </label>

          {errorMessage && (
            <p className="auth-page__error" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            className="auth-page__submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "처리 중"
              : isSignUpMode
                ? "가입하고 시작하기"
                : "로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}
