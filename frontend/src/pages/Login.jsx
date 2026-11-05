import { useState } from "react";
import { Home, Check, ShieldCheck } from "lucide-react";
import { api, setToken } from "../api.js";
import { Field, Form } from "../components/shared.jsx";
import { Report } from "./Report.jsx";
import { roles, label } from "../format.js";
import "./Login.css";

function Login({ onLogin }) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [notice, setNotice] = useState("");
  const demos = [
    { name: "Tenant", email: "sarahwilliams@example.com" },
    { name: "Manager", email: "michael.jacobs@obsrealty.co.za" },
    { name: "Technician", email: "johan.vdm@obsrealty.co.za" },
    { name: "Admin", email: "admin@obsrealty.co.za" },
  ];
  return (
    <main className="login">
      <section className="login-story">
        <a className="brand" href="#/">
          <span className="brand-mark">
            <Home size={22} />
          </span>
          PropCare<span className="brand-dot">.</span>
        </a>
        <div>
          <p className="eyebrow">OBS REALTY GROUP</p>
          <h1>
            A better place
            <br />
            to call <em>home.</em>
          </h1>
          <p>
            From the first report to the final repair.
            <br />
            Property care, with everyone in the loop.
          </p>
          <div className="story-card">
            <span className="story-icon">
              <Check />
            </span>
            <div>
              <strong>Every repair has a clear next step</strong>
              <p>Report. Assign. Resolve.</p>
            </div>
          </div>
        </div>
        <small>Property maintenance made personal.</small>
      </section>
      <section className="login-form">
        <div>
          <p className="eyebrow">YOUR PROPERTY WORKSPACE</p>
          <h2>{register ? "Make yourself at home" : "Welcome back"}</h2>
          <p className="subtle">
            {register
              ? "Create a tenant account. Your administrator will verify and link your property."
              : "Sign in to keep your property moving forward."}
          </p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <Form
            key={String(register)}
            button={register ? "Create tenant account" : "Sign in to PropCare"}
            onSave={async (f) => {
              const body = Object.fromEntries(f);
              if (register) {
                const r = await api("/auth/register", "POST", body);
                setNotice(r.message);
                setRegister(false);
              } else {
                const r = await api("/auth/login", "POST", body);
                setToken(r.token);
                onLogin(r.user);
              }
            }}
          >
            {register && (
              <Field label="Full name">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint={
                register
                  ? "At least 10 characters, including uppercase, lowercase and a number."
                  : null
              }
            >
              <input
                name="password"
                type="password"
                required
                minLength={register ? 10 : 1}
                maxLength={72}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
          </Form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setNotice("");
            }}
          >
            {register
              ? "Already registered? Sign in"
              : "New tenant? Create an account"}
          </button>
          {!register && (
            <details className="demo">
              <summary>Explore the demo accounts</summary>
              <div className="demo-roles">
                {demos.map((d) => (
                  <button key={d.email} onClick={() => setEmail(d.email)}>
                    {d.name}
                  </button>
                ))}
              </div>
              <small>Use the demo password supplied by your team.</small>
            </details>
          )}
          <p className="login-help">
            <ShieldCheck size={15} />
            Access is controlled by your assigned role.
          </p>
        </div>
      </section>
    </main>
  );
}

export { Login };
