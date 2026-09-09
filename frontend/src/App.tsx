import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { MarketListPage } from "./pages/MarketListPage";
import { MarketPage } from "./pages/MarketPage";
import { CreateMarketPage } from "./pages/CreateMarketPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<MarketListPage />} />
        <Route path="/market/:marketId" element={<MarketPage />} />
        <Route path="/create" element={<CreateMarketPage />} />
      </Route>
    </Routes>
  );
}
