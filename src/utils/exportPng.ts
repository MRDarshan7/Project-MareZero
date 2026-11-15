export function exportCanvasPng(canvas: HTMLCanvasElement, filename: string = 'lunar-landing-site-dome.png'): void {
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to export PNG snapshot', err);
  }
}

export async function exportSvgPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 2400; canvas.height = Math.round(2400 * svg.viewBox.baseVal.height / svg.viewBox.baseVal.width);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    exportCanvasPng(canvas, filename);
  } finally { URL.revokeObjectURL(url); }
}
