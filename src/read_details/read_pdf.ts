// Portion of this code is adapted from pdf-to-img by Kyle Hensel (https://github.com/k-yle/pdf-to-img)

import * as fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type Canvas from "canvas";
import type { Worker } from 'tesseract.js';

type Factory = {
  canvas: Canvas.Canvas;
};

export interface CanvasFactory {
  create(
    width: number,
    height: number
  ): Factory;
};

const addressRec = {
  totalHeight: 1445,
  totalWidth: 1020,
  left: 449,
  top: 936,
  width: 517,
  height: 271
};
const dateRec = {
  totalHeight: 1445,
  totalWidth: 1020,
  left: 339,
  top: 877,
  width: 169,
  height: 58
};
const orderRec = {
  totalHeight: 1445,
  totalWidth: 1020,
  left: 496,
  top: 809,
  width: 291,
  height: 61
};

export const read_pdf = async (pdfPath: string, worker: Worker) => {

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

    const { data: { text: order } } = await worker.recognize(jpgBuffer, {
      rectangle: {
        height: orderRec.height / orderRec.totalHeight * viewport.height,
        width: orderRec.width / orderRec.totalWidth * viewport.width,
        top: orderRec.top / orderRec.totalHeight * viewport.height,
        left: orderRec.left / orderRec.totalWidth * viewport.width,
      }
    });

    const { data: { text: address } } = await worker.recognize(jpgBuffer, {
      rectangle: {
        height: addressRec.height / addressRec.totalHeight * viewport.height,
        width: addressRec.width / addressRec.totalWidth * viewport.width,
        top: addressRec.top / addressRec.totalHeight * viewport.height,
        left: addressRec.left / addressRec.totalWidth * viewport.width,
      }
    });

    const { data: { text: date } } = await worker.recognize(jpgBuffer, {
      rectangle: {
        height: dateRec.height / dateRec.totalHeight * viewport.height,
        width: dateRec.width / dateRec.totalWidth * viewport.width,
        top: dateRec.top / dateRec.totalHeight * viewport.height,
        left: dateRec.left / dateRec.totalWidth * viewport.width,
      }
    });

    const row = `"${order}", "${date}", "${address}"` as const;
    return row;
  };

  return {
    length: pdfDocument.numPages,
    getPage
  };
};