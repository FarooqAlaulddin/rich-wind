import { index, route } from "@react-router/dev/routes";

export default [
    index("./routes/home.jsx"),
    route("/htmx/compile", "./routes/htmx.compile.jsx"),
    route("/preview", "./routes/preview.jsx")
];
