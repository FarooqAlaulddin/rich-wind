import AnalyticsDashboard from "../components/plugins/AnalyticsDashboard.jsx";
import AutoPromoteDashboard from "../components/plugins/AutoPromoteDashboard.jsx";

export const PLUGIN_REGISTRY = {
  analytics: {
    dataEndpoint: "/plugins/analytics/data",
    component: AnalyticsDashboard,
  },
  "auto-promote": {
    dataEndpoint: "/plugins/auto-promote/stats",
    component: AutoPromoteDashboard,
  },
};
