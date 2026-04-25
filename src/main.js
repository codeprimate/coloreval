import "./styles/base.css";
import { attachColorevalConsoleHelpers } from "./console-helpers.js";
import { initApp } from "./app.js";

attachColorevalConsoleHelpers();
initApp(document.getElementById("app"));
