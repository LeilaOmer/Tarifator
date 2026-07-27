Fisiere de rulare Tesseract.js, GAZDUITE LOCAL — intentionat.

DE CE nu de pe CDN: CSP-ul aplicatiei are `connect-src 'self'` (next.config.ts),
deci orice fetch catre un CDN extern e blocat. In plus, gazduirea locala face
citirea pozelor sa mearga si offline (PWA) si o scoate de sub orice depreciere
sau schimbare de plan a unui furnizor — exact problema care a omorat scanarea
prin modelul de vedere (Groq, iulie 2026).

Provenienta (a se reface identic la actualizare):
  worker.min.js                    <- node_modules/tesseract.js/dist/
  tesseract-core-simd-lstm.wasm    <- node_modules/tesseract.js-core/
  tesseract-core-simd-lstm.wasm.js <- node_modules/tesseract.js-core/
  ron.traineddata.gz               <- tessdata_fast
                                      (github.com/tesseract-ocr/tessdata_fast)
                                      varianta "fast": 1,1 MB fata de ~6 MB la
                                      cea standard. Diferenta de acuratete e
                                      mica pe text tiparit de factura.

Se descarca o SINGURA DATA pe dispozitiv (service worker le pune in cache),
deci costul de ~5 MB il plateste utilizatorul la prima scanare din poza.
