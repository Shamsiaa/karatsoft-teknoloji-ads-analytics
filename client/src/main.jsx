import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown UI error" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", padding: 24, background: "#ffffff", color: "#111827" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Dashboard failed to render</h1>
          <p style={{ marginBottom: 4 }}>{this.state.message}</p>
          <p>Open browser console for stack trace.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
