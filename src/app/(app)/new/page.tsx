"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { ExpenseForm } from "@/components/app/expense-form";

export default function NewExpensePage() {
  const router = useRouter();
  // Remount the form after each save so it is fresh when returning to this screen.
  const [formKey, setFormKey] = useState(0);
  return (
    <div>
      <PageHeader title="הוצאה חדשה" subtitle="סכום, תיאור, קטגוריה — וזהו." />
      <ExpenseForm
        key={formKey}
        onDone={() => {
          setFormKey((k) => k + 1);
          router.push("/");
        }}
      />
    </div>
  );
}
