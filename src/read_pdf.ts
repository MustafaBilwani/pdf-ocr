// Portion of this code is adapted from pdf-to-img by Kyle Hensel (https://github.com/k-yle/pdf-to-img)

import * as fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type Canvas from "canvas";
import { PDFDocument } from 'pdf-lib'
import type { Worker } from 'tesseract.js';

type Factory = {
  canvas: Canvas.Canvas;
};

export interface CanvasFactory {
  create(
    width: number,
    height: number
  ): Factory;
}

export const read_pdf = async (pdfPath: string, worker: Worker) => {

  const data = new Uint8Array(await fs.readFile(pdfPath));

  const pdfDocument = await getDocument({
    data,
  }).promise;

  const sampleRec = {
    totalHeight: 1083,
    totalWidth: 765,
    top: 594,
    left: 147,
    width: 519,
    height: 55
  };

  async function getPage(pageNumber: number) {

    const page = await pdfDocument.getPage(pageNumber);

    const viewport = page.getViewport({ scale: 1.5 });

    const { canvas } = (pdfDocument.canvasFactory as CanvasFactory).create(
      viewport.width,
      viewport.height
    );

    await page.render({
      canvas,
      viewport
    }).promise;

    const jpgBuffer = canvas.toBuffer("image/jpeg", {});
    const { data: { text } } = await worker.recognize(jpgBuffer, {
      rectangle: {
        height: sampleRec.height / sampleRec.totalHeight * viewport.height,
        width: sampleRec.width / sampleRec.totalWidth * viewport.width,
        top: sampleRec.top / sampleRec.totalHeight * viewport.height,
        left: sampleRec.left / sampleRec.totalWidth * viewport.width,
      }
    });

    const newPdf = await PDFDocument.create();
    const jpgImage = await newPdf.embedJpg(jpgBuffer);

    const pageDims = jpgImage.scale(1);
    const pdfPage = newPdf.addPage([pageDims.width, pageDims.height]);
    pdfPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: pageDims.width,
      height: pageDims.height,
    });

    const pdfBytes = await newPdf.save();

    return [pdfBytes, text] as const;
  };

  return {
    length: pdfDocument.numPages,
    getPage
  };
};