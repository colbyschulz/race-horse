import { cache } from "react";
import { auth } from "@/server/auth";

export const getSession = cache(auth);
