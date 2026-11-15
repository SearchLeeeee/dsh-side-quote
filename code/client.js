/**
 * Browser half of dsh-side-quote.
 * Zero build: this file is the module itself and is loaded by the DSH client loader.
 * Install skeleton only: it registers an empty module so the manifest, patch and
 * loader wiring can be verified. Selection capture is not implemented here.
 */
window.__ModuleLoader__.load({
  id: 'dsh-side-quote',
  factory(require) {
    return {
      inject: [],
      apply() {},
    };
  },
});
