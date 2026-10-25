import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs"

/**
 * Turns WXT's packaged Firefox build into an installable `.xpi`.
 *
 * `wxt zip -b firefox` names its artifact `<name>-<version>-firefox.zip`, so the
 * version is baked into the filename and moves with every release. This picks
 * the newest such zip and leaves a stable `build/page-assist-firefox.xpi` beside
 * it, which is the path humans and `web-ext` can point at without guessing.
 */

const BUILD_DIR = "build"
const ZIP_SUFFIX = "-firefox.zip"
const XPI_PATH = `${BUILD_DIR}/page-assist-firefox.xpi`

/** Candidate archives, newest first: a stale zip from an earlier build must not win. */
const archives = readdirSync(BUILD_DIR)
  .filter((file) => file.endsWith(ZIP_SUFFIX))
  .map((file) => ({
    path: `${BUILD_DIR}/${file}`,
    modified: statSync(`${BUILD_DIR}/${file}`).mtimeMs
  }))
  .sort((a, b) => b.modified - a.modified)

if (archives.length === 0) {
  throw new Error(
    `No ${ZIP_SUFFIX} artifact in ${BUILD_DIR}/. Run \`bun run zip:firefox\` first.`
  )
}

// Replace the previous xpi rather than fail on an existing one: it is a build
// artifact, and keeping the old one around would silently ship the wrong build.
if (existsSync(XPI_PATH)) {
  unlinkSync(XPI_PATH)
}

renameSync(archives[0].path, XPI_PATH)
console.log(`xpi: ${XPI_PATH}`)
