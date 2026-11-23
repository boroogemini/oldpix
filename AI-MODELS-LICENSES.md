# OLDpix AI model attributions

OLDpix runs all photo inference in the visitor's browser with ONNX Runtime Web. The uploaded photo is not sent to OLDpix servers. Model binaries are downloaded from Hugging Face and cached locally by the browser; each model is checked against its published SHA-256 before loading.

| Model | Purpose | License | Source |
|---|---|---|---|
| Bringing Old Photos Back to Life scratch detector | Detect scratches, cracks and dust | MIT | Microsoft Research / ONNX export in `ingmebs/bspicture-modelos` |
| LaMa (big-lama) | Inpaint detected damaged regions | Apache-2.0 | Samsung Research / Carve ONNX export, mirrored in `ingmebs/bspicture-modelos` |
| DDColor tiny | Restore plausible color in monochrome photos | Apache-2.0 | DDColor / Qualcomm AI Hub ONNX export, mirrored in `ingmebs/bspicture-modelos` |
| Real-ESRGAN x4plus | Detail enhancement and 4× super-resolution | BSD-3-Clause | Real-ESRGAN ONNX export |

Model repository: https://huggingface.co/ingmebs/bspicture-modelos

Original projects:
- https://github.com/microsoft/Bringing-Old-Photos-Back-to-Life
- https://github.com/advimman/lama
- https://github.com/piddnad/DDColor
- https://github.com/xinntao/Real-ESRGAN

The model weights remain subject to their respective upstream licenses. This attribution does not imply endorsement by the original authors. AI restoration can infer or reconstruct missing details; it cannot guarantee recovery of the exact original appearance.
