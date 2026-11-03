import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errMsg } from "../api";
import { useAuth } from "../context/AuthContext";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(errMsg(err));
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="logo">💬 ChatWave</div>
        <h1>{isLogin ? "Welcome back" : "Join the conversation"}</h1>
        {error && <div className="error">{error}</div>}
        {!isLogin && (
          <input
            name="name"
            placeholder="Display name"
            value={form.name}
            onChange={onChange}
            maxLength={30}
            required
          />
        )}
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={onChange} required />
        <input
          name="password"
          type="password"
          placeholder="Password (min 6 characters)"
          value={form.password}
          onChange={onChange}
          minLength={6}
          required
        />
        <button className="btn primary" disabled={loading}>
          {loading ? "Please wait…" : isLogin ? "Log in" : "Sign up"}
        </button>
        <p className="muted center">
          {isLogin ? "No account? " : "Already registered? "}
          <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Sign up" : "Log in"}</Link>
        </p>
      </form>
    </div>
  );
}
