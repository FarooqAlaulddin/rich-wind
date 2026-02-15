/**
 * Admin Plugin
 *
 * Lightweight plugin that exposes project/page listing endpoints.
 * No hooks — purely a route provider.
 *
 * Routes:
 *   GET /projects?prefix=<prefix>  — list project IDs filtered by prefix
 *   GET /pages/:projectId          — list page IDs for a project
 */

export function createAdminPlugin() {
  return {
    name: 'admin',

    async setup(context) {
      context.addRoute('get', '/projects', (req, res) => {
        const prefix = req.query.prefix || '';
        const all = context.getProjectIds();
        const filtered = prefix
          ? all.filter((id) => id.startsWith(prefix))
          : all;
        res.json({ projects: filtered });
      });

      context.addRoute('get', '/pages/:projectId', (req, res) => {
        const pages = context.getPageIds(req.params.projectId) || [];
        res.json({ pages });
      });
    },
  };
}

export default createAdminPlugin;
