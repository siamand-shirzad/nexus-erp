import { listProducts } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { ProductsView } from "./ProductsView";
import type { Product } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, session] = await Promise.all([
    listProducts(),
    getSession(),
  ]);
  return (
    <ProductsView
      initialProducts={products as Product[]}
      role={session!.role}
    />
  );
}
