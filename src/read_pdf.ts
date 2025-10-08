// Portion of this code is adapted from pdf-to-img by Kyle Hensel (https://github.com/k-yle/pdf-to-img)

import * as fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type Canvas from "canvas";
import { PDFDocument } from 'pdf-lib'
import { worker } from './index.js';

type Factory = {
  canvas: Canvas.Canvas;
};

export interface CanvasFactory {
  create(
    width: number,
    height: number
  ): Factory;
}

export const read_pdf = async (pdfPath: string) => {

  const data = new Uint8Array(await fs.readFile(pdfPath));

  const pdfDocument = await getDocument({
    data,
  }).promise;


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
        height: Math.round(viewport.height * 0.0475624),
        left: Math.round(viewport.width * 0.2352941176470588),
        top: Math.round(viewport.height * 0.5469678953626635),
        width: Math.round(viewport.width * 0.5882352941176471)
      }
    });

    const orderNumber = Number(text.replaceAll(':', '').split('Order Number')[1]?.split('\n')[0]) || null;

    if (!orderNumber) {
      console.log(`cant read page ${pageNumber}`, text);
    };

    const newPdf = await PDFDocument.create();
    const pngImage = await newPdf.embedJpg(jpgBuffer);

    const pageDims = pngImage.scale(1);
    const pdfPage = newPdf.addPage([pageDims.width, pageDims.height]);
    pdfPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageDims.width,
      height: pageDims.height,
    });

    const pdfBytes = await newPdf.save();

    return [pdfBytes, orderNumber] as const;
  };

  return {
    length: pdfDocument.numPages,
    getPage
  };
};