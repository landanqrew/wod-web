"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { LogResultPane } from "@/components/log-result-pane";
import type { Workout } from "@/lib/domain/models/workout";

export function BenchmarkActions({ workout }: { workout: Workout }) {
  const [logging, setLogging] = React.useState(false);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setLogging(true)}>
        Log attempt
      </Button>
      <LogResultPane
        open={logging}
        onClose={() => setLogging(false)}
        workout={workout}
        persistWorkout
      />
    </>
  );
}
