import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { promises as fs } from "node:fs";
import { read_pdf } from './read_pdf.js';
import path from 'node:path';
import { createWorker, type Worker } from "tesseract.js";
import { glob } from "glob";

const workersQuantity = 3;

console.log(`using ${workersQuantity} workers`)
console.time('create workers')

export const workers = await Promise.all(
  Array.from({ length: workersQuantity }, async () => ({
    worker: await createWorker('eng'),
    isfree: true
  }))
);

console.timeEnd('create workers')

const prevDir = path.resolve('../');

main();

async function main() {

  const files = await glob("**/*.pdf", {
    cwd: prevDir,
    ignore: ['output/**', 'completed/**', 'unrecognised/**'],
  });
  console.log(files.length, 'files found');

  await makeOutputAndCompletedDirs();

  console.time('Total time taken');
  
  await Promise.all(
    workers.map(async ({ worker }) => {

      while (files.length > 0) {

        const pdf = files.shift()!
        const pdfAbsolutePath = path.join(prevDir, pdf);
        await processPdf(pdfAbsolutePath, worker);
      
      }
      
      await worker.terminate()
    })
  )

  await clearEmptyDirs();

  console.timeEnd('Total time taken');
};


async function processPdf(pdfAbsolutePath: string, worker: Worker) {

  // console.time(pdfAbsolutePath);

  const { length, getPage } = await read_pdf(pdfAbsolutePath, worker);

  for (let counter = 1; counter <= length; counter++) {

    const [image, text] = await getPage(counter);

    const trimmedText = text.replaceAll(':', '').split('Order Number')[1]?.split('\n')[0]?.trim() || '';

    if (Number(trimmedText)) {

      const newPath = await findAvailableFileName(path.join(prevDir, 'output', `${trimmedText}`));
      await fs.writeFile(newPath, image);

    } else {

      await fs.mkdir(path.join(prevDir, 'unrecognised'), { recursive: true });
      const newPath = await findAvailableFileName(path.join(prevDir, 'unrecognised', trimmedText));
      await fs.writeFile(newPath, image);

    };
  };

  // console.timeEnd(pdfAbsolutePath);

  const pdfDirectory = path.dirname(pdfAbsolutePath);

  const newDirName = path.join(prevDir, 'completed', path.relative(prevDir, pdfDirectory));

  await fs.mkdir(newDirName, { recursive: true });

  let newPath = path.join(newDirName, path.basename(pdfAbsolutePath, '.pdf'));
  newPath = await findAvailableFileName(newPath);

  await fs.rename(pdfAbsolutePath, newPath);
};

async function findAvailableFileName(fileName: string) {
  const ext = '.pdf';
  let filePath = fileName + ext;
  let counter = 1;

  while (true) {
    try {
      await fs.access(filePath);
      filePath = `${fileName} (${++counter})${ext}`;
    } catch {
      return filePath;
    };
  };
};

async function makeOutputAndCompletedDirs() {
  const prevDir = path.resolve('../');
  await fs.mkdir(path.join(prevDir, 'completed'), { recursive: true });
  await fs.mkdir(path.join(prevDir, 'output'), { recursive: true });
}

async function clearEmptyDirs() {
  const dirs = await glob("**/", {
    cwd: prevDir,
    ignore: ['output/**', 'completed/**', 'unrecognised/**', 'code/**'],
  });

  for await (const dir of dirs.reverse()) {
    const dirPath = path.join(prevDir, dir);
    const dirFiles = await fs.readdir(dirPath);
    if (dirFiles.length === 0) {
      await fs.rmdir(dirPath);
    };
  };
};