// Stamps each build with an id: the app gets it as __BUILD_ID__ and the live
// one is published at /version.json, so an open tab can tell that a newer
// build has been deployed (src/shared/components/UpdateNotice.js).
export function buildVersion() {
  const id = Date.now().toString(36);
  return {
    name: 'build-version',
    config() {
      return { define: { __BUILD_ID__: JSON.stringify(id) } };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id }) });
    },
  };
}
