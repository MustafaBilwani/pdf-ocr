import { promises as fs } from "node:fs";
import path from 'node:path';
import { createWorker, type Worker } from "tesseract.js";
import { glob } from "glob";
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type Canvas from "canvas";

type Factory = {
  canvas: Canvas.Canvas;
};

interface CanvasFactory {
  create(
    width: number,
    height: number
  ): Factory;
};

const workersQuantity = 3;

let data = ``;

const orderNumbers = new Set<string>();

const prevDir = path.resolve('../');

console.log(`using ${workersQuantity} workers`);
console.time('create workers');

const workers = await Promise.all(
  Array.from({ length: workersQuantity }, async () => ({
    worker: await createWorker('eng'),
    isfree: true
  }))
);

console.timeEnd('create workers');

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

console.time('Total time taken');

await main();

console.timeEnd('Total time taken');

async function main() {

  const files = await glob("**/*.pdf", {
    cwd: prevDir,
    ignore: ['output/**', 'unrecognised/**'],
  });

  console.log(files.length, 'files found');

  let counter = 0;

  await Promise.all(

    workers.map(async ({ worker }) => {

      while (counter < files.length) {

        const pdf = files[counter++]!
        const pdfAbsolutePath = path.join(prevDir, pdf);
        await read_pdf(pdfAbsolutePath, worker);

      };

      await worker.terminate();
    })
  );

  let c = 1;
  let filePath = `../output.csv`;

  while (true) {
    try {

      await fs.writeFile(filePath, data);

      console.log(`written to ${filePath}`);
      break;

    } catch {
      filePath = `../output (${++c}).csv`;
    };
  };
};

async function read_pdf(pdfPath: string, worker: Worker) {

  const pdfRawData = new Uint8Array(await fs.readFile(pdfPath));

  const pdfDocument = await getDocument({
    data: pdfRawData,
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

    if (orderNumbers.has(order)) {
      return;
    }

    orderNumbers.add(order);

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

    data += `"${order}","${date}","${address}"\n` as const;
  };

  for (let counter = 1; counter <= pdfDocument.numPages; counter++) {

    await getPage(counter);

  };
};
