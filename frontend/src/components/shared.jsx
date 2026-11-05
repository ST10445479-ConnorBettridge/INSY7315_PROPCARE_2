import { useEffect, useRef, useState } from "react";
import { Wrench, ArrowRight, X } from "lucide-react";
import { label } from "../format.js";
import "./shared.css";

function Loading({ state, children }) {
  if (state.loading)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Loading your workspace…
      </div>
    );
  if (state.error)
    return (
      <div className="error" role="alert">
        {state.error}
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  return children(state.data);
}

function Badge({ value }) {
  return <span className={"badge badge-" + value}>{label(value)}</span>;
}

function Field({ label: name, children, hint }) {
  return (
    <label className="field-label">
      <span>{name}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Heading({ eyebrow, title, children, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="subtle">{children}</p>}
      </div>
      {action}
    </div>
  );
}

function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <Wrench size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Form({ onSave, children, button = "Save changes", className = "" }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={className}
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          await onSave(new FormData(e.currentTarget), e.currentTarget);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary" type="submit">
          {busy ? "Saving…" : button}
          <ArrowRight size={16} />
        </button>
      </fieldset>
    </form>
  );
}

function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialogTitle"
      aria-modal="true"
    >
      <div className="dialog-header">
        <h2 id="dialogTitle">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export { Loading, Badge, Field, Heading, Empty, Form, Modal };
