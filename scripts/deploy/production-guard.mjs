import { pathToFileURL } from "node:url";

// Vercel limits the project Build Command to 256 characters. Keep the guard
// inline so old commits without this file are protected as well. The literal
// tab matches git ls-remote's output; && preserves lookup and build failures.
export function guardedBuildCommand() {
  return 'c(){ [ "$VERCEL_ENV" != production ] || { [ "$VERCEL_GIT_COMMIT_REF" = main ] && r=$(timeout 20 git ls-remote -h https://github.com/blackshoes1/invitation-one main) && [ "$r" = "$VERCEL_GIT_COMMIT_SHA\trefs/heads/main" ]; }; }; c && npm run build && c';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "--project-settings") {
    throw new Error("Use --project-settings to generate the Vercel project PATCH payload.");
  }
  console.log(JSON.stringify({ buildCommand: guardedBuildCommand() }));
}
