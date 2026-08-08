import { MOVEMENT_LIBRARY } from "@/lib/domain/movements/library";
import { MovementsClient } from "./movements-client";

export default function MovementsPage() {
  return <MovementsClient movements={MOVEMENT_LIBRARY} />;
}
