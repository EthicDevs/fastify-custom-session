export function generateUniqSerial(): string {
  return "xxxx-xxxx-xxx-xxxx".replace(/[x]/g, (_) => {
    const r = Math.floor(Math.random() * 16);
    return r.toString(16);
  });
}
