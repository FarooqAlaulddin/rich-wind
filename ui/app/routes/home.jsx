import { useEffect, useState } from "react";
import { sampleHtml, sampleClasses, sampleCustomCss } from "../components/studio/sample-data.js";
import TopBar from "../components/studio/TopBar.jsx";
import EditorPanel from "../components/studio/EditorPanel.jsx";
import PreviewPanel from "../components/studio/PreviewPanel.jsx";
import ApiTelemetry from "../components/studio/ApiTelemetry.jsx";
import { getUserId, generateUserId, buildSetCookie } from "../lib/user-id.server.js";

import "../demo.css";

export async function loader({ request }) {
  let userId = getUserId(request);
  if (userId) return {};

  userId = generateUserId();
  return new Response(JSON.stringify({}), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSetCookie(userId),
    },
  });
}

export function meta() {
  return [
    { title: "Rich Wind - Stateless Tailwind Runtime" },
    {
      name: "description",
      content:
        "Compile Tailwind CSS from live HTML or class lists with an in-memory cache.",
    },
  ];
}

export default function Home() {
  const [html, setHtml] = useState(sampleHtml);
  const [classes, setClasses] = useState(sampleClasses);
  const [customCss, setCustomCss] = useState(sampleCustomCss);
  const [bundle, setBundle] = useState("full");
  const [activeTab, setActiveTab] = useState("html");
  const [outputTab, setOutputTab] = useState("preview");

  const handleReset = () => {
    setHtml(sampleHtml);
    setClasses(sampleClasses);
    setCustomCss(sampleCustomCss);
    setBundle("full");
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rw-editor-state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.html) setHtml(parsed.html);
        if (parsed.classes) setClasses(parsed.classes);
        if (parsed.customCss) setCustomCss(parsed.customCss);
        if (parsed.bundle) setBundle(parsed.bundle);
      }
    } catch (error) {
      console.error("Failed to load editor state", error);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          "rw-editor-state",
          JSON.stringify({ html, classes, customCss, bundle })
        );
      } catch (error) {
        console.error("Failed to save editor state", error);
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [html, classes, customCss, bundle]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (error) {
        console.error("Failed to refresh layout", error);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, [activeTab]);

  return (
    <main className="play-shell">
      <TopBar />

      <section className="play-body" suppressHydrationWarning>
        <div id="studio-grid" className="studio-grid" suppressHydrationWarning>
          <EditorPanel
            html={html} setHtml={setHtml}
            classes={classes} setClasses={setClasses}
            customCss={customCss} setCustomCss={setCustomCss}
            bundle={bundle} setBundle={setBundle}
            activeTab={activeTab} setActiveTab={setActiveTab}
            onReset={handleReset}
          />

          <div id="splitter" className="splitter" aria-hidden="true" />

          <PreviewPanel outputTab={outputTab} setOutputTab={setOutputTab} />
        </div>

        <ApiTelemetry />
      </section>
    </main>
  );
}
