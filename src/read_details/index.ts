import { promises as fs } from "node:fs";
import { read_pdf } from './read_pdf.js';
import path from 'node:path';
import { createWorker, type Worker } from "tesseract.js";
import { glob } from "glob";

const workersQuantity = 3;

let data = ``;

console.log(`using ${workersQuantity} workers`);
console.time('create workers');

export const workers = await Promise.all(
  Array.from({ length: workersQuantity }, async () => ({
    worker: await createWorker('eng'),
    isfree: true
  }))
);

console.timeEnd('create workers');

const prevDir = path.resolve('../');

main();

async function main() {

  const files = await glob("**/*.pdf", {
    cwd: prevDir,
    ignore: ['output/**', 'unrecognised/**'],
  });
  console.log(files.length, 'files found');

  console.time('Total time taken');

  let counter = 0;

  await Promise.all(

    workers.map(async ({ worker }) => {

      while (counter < files.length) {

        const pdf = files[counter++]!
        const pdfAbsolutePath = path.join(prevDir, pdf);
        await processPdf(pdfAbsolutePath, worker);

      };

      await worker.terminate();
    })
  );

  console.timeEnd('Total time taken');

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

async function processPdf(pdfAbsolutePath: string, worker: Worker) {

  // console.time(pdfAbsolutePath);

  const { length, getPage } = await read_pdf(pdfAbsolutePath, worker);

  for (let counter = 1; counter <= length; counter++) {

    const row = await getPage(counter);

    data += row + '\n';

  };

  // console.timeEnd(pdfAbsolutePath);

};
