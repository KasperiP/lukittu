const THOUSAND = 1000;
const HUNDRED_THOUSAND = 100000;
const MILLION = 1000000;
const HUNDRED_MILLION = 100000000;
const BILLION = 1000000000;
const HUNDRED_BILLION = 100000000000;
const TRILLION = 1000000000000;

export default function numberFormatter(num: number) {
  if (num >= THOUSAND && num < MILLION) {
    const thousands = num / THOUSAND;
    if (thousands === Math.floor(thousands) || num >= HUNDRED_THOUSAND) {
      return Math.floor(thousands) + 'k';
    } else {
      return Math.floor(thousands * 10) / 10 + 'k';
    }
  } else if (num >= MILLION && num < BILLION) {
    const millions = num / MILLION;
    if (millions === Math.floor(millions) || num >= HUNDRED_MILLION) {
      return Math.floor(millions) + 'M';
    } else {
      return Math.floor(millions * 10) / 10 + 'M';
    }
  } else if (num >= BILLION && num < TRILLION) {
    const billions = num / BILLION;
    if (billions === Math.floor(billions) || num >= HUNDRED_BILLION) {
      return Math.floor(billions) + 'B';
    } else {
      return Math.floor(billions * 10) / 10 + 'B';
    }
  } else {
    return num;
  }
}

export function bytesToSize(bytes: number) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

export const bytesToMb = (bytes: number) =>
  Math.round((bytes / 1024 / 1024) * 100) / 100;
