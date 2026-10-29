// Minimal Pages context for the imported price endpoint; no runtime shim.
type PagesFunction = (context: { request: Request }) => Response | Promise<Response>
