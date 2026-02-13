import { index, route } from "@react-router/dev/routes";

  export default [
      index("./routes/home.jsx"),
      route("/htmx/compile", "./routes/htmx.compile.jsx"),
      route("/api/suggest", "./routes/api.suggest.jsx"),
      route("/preview", "./routes/preview.jsx"),
    route("/docs/*", "./routes/docs.jsx")
  ];
