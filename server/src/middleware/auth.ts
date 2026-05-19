import { Request, Response, NextFunction } from "express";
import { AppSession } from "../types";

export const getSession = (req: Request): AppSession => {
  return req.session as unknown as AppSession;
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const session = getSession(req);

  if (!session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  next();
};

