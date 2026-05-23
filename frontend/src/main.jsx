import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { ThemeProvider } from "@material-tailwind/react";
import AppPopupProvider from "./components/AppPopupProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AppPopupProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppPopupProvider>
    </ThemeProvider>
  </StrictMode>,
);
