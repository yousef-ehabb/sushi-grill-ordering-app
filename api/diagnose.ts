import { getHello } from './_lib/testHelper';

export default async function handler(req: any, res: any) {
  try {
    const msg = getHello();
    res.status(200).json({ success: true, msg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message, stack: err?.stack });
  }
}
