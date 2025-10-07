import { promises as fs } from "node:fs";
import { read_pdf } from './read_pdf.js';
import path from 'node:path'
import { createWorker } from "tesseract.js";

export const worker = await createWorker('eng')

main();

async function main() {
  console.time('Total time taken');

  const prevDir = path.resolve('../');
  const dirContents = await fs.readdir(prevDir);

  for await (const childDir of dirContents) {

    const absolutePath = path.join(prevDir, childDir)
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory()) await processDir(absolutePath);
  };

  await worker.terminate()

  console.timeEnd('Total time taken');
}

async function processDir(dirPath: string) {
  const dirContents = await fs.readdir(dirPath);

  const pdfs = dirContents.filter(f => f.endsWith('.pdf'));

  if (pdfs.length > 1) {
    await fs.mkdir(path.join(dirPath, 'completed'), { recursive: true })
    await fs.mkdir(path.join(dirPath, 'output'), { recursive: true })
  }

  for await (const pdf of pdfs) {
    const pdfAbsolutePath = path.join(dirPath, pdf)

    await processPdf(pdfAbsolutePath)

    let newPath = path.join(dirPath, 'completed', path.basename(pdfAbsolutePath, '.pdf'))
    newPath = await findAvailableFileName(newPath)
    
    await fs.rename(pdfAbsolutePath, newPath)
  };

}

async function processPdf(pdfPath: string) {

  console.time(pdfPath);

  const directoryPath = path.dirname(pdfPath)

  const { length, getPage } = await read_pdf(pdfPath);

  for (let counter = 1; counter <= length; counter++) {

    const [image, orderNumber] = await getPage(counter);

    if (orderNumber) {
    
      const newPath = await findAvailableFileName(path.join(directoryPath, 'output', `${orderNumber}`));
      await fs.writeFile(newPath, image);
    
    } else {
    
      await fs.mkdir(path.join(directoryPath, 'unrecognised'), { recursive: true });
    
      const fallbackName = `${path.basename(pdfPath, '.pdf')} - page${counter}`;
      const newPath = await findAvailableFileName(path.join(directoryPath, 'unrecognised', fallbackName));
    
      await fs.writeFile(newPath, image);
    
    };

  };

  console.timeEnd(pdfPath);
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