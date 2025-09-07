import React, { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatEther, parseEther, parseUnits } from "ethers";
import TIFFY_ABI from "./TiffyAI.json"; // adjust path if ABI is in /src/abi

// ⚡ Your deployed contract
const TIFFY_ADDRESS = "0xE488253DD6B4D31431142F1b7601C96f24Fb7dd5";
const ADMIN_OWNER = "0x2a234d5Cc7431B824723c84c8605fD3968BF0255";

declare global {
  interface Window {
    ethereum?: any;
  }
}

function shortAddr(a?: string) {
  if (!a) return "";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

export default function App() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<any>(null);
  const [account, setAccount] = useState<string>("");
  const [tiffyContract, setTiffyContract] = useState<Contract | null>(null);

  const [balance, setBalance] = useState<string>("0");
  const [fixedFee, setFixedFee] = useState<string>("0");
  const [lastClaimTs, setLastClaimTs] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  // admin state
  const [aiTokenIn, setAiTokenIn] = useState<string>("");
  const [aiTokenOut, setAiTokenOut] = useState<string>("");
  const [aiAmountIn, setAiAmountIn] = useState<string>("");
  const [aiAmountOutMin, setAiAmountOutMin] = useState<string>("0");

  // init provider
  useEffect(() => {
    if (window.ethereum) {
      const prov = new BrowserProvider(window.ethereum);
      setProvider(prov);
      const contract = new Contract(TIFFY_ADDRESS, TIFFY_ABI, prov);
      setTiffyContract(contract);
    } else {
      setStatus("No Web3 wallet found. Install MetaMask.");
    }
  }, []);

  async function connect() {
    if (!provider) return setStatus("No provider");
    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner();
    const addr = await s.getAddress();
    setSigner(s);
    setAccount(addr);
    setTiffyContract(new Contract(TIFFY_ADDRESS, TIFFY_ABI, s));
    setStatus("Connected: " + shortAddr(addr));
    fetchOnchain(addr);

    if (window.ethereum?.on) {
      window.ethereum.on("accountsChanged", async (acs: string[]) => {
        if (acs.length === 0) {
          setAccount("");
          setSigner(null);
        } else {
          const newSigner = await provider.getSigner();
          setAccount(acs[0]);
          setSigner(newSigner);
        }
      });
    }
  }

  async function fetchOnchain(addr?: string) {
    if (!tiffyContract) return;
    try {
      const user = addr ?? account;
      const bal = await tiffyContract.balanceOf(user);
      setBalance(formatEther(bal));
      const feeBN = await tiffyContract.FIXED_BNB_FEE();
      setFixedFee(formatEther(feeBN));
      const last = await tiffyContract.lastClaimed(user);
      setLastClaimTs(Number(last));
    } catch (err: any) {
      console.error(err);
      setStatus("Read error: " + err.message);
    }
  }

  // ===== CLAIM =====
  async function doClaim() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    try {
      const feeBN = await tiffyContract.FIXED_BNB_FEE();
      const tx = await tiffyContract.claim({ value: feeBN });
      setStatus("Claim sent: " + tx.hash);
      await tx.wait();
      setStatus("Claim confirmed!");
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Claim failed: " + (err.message ?? err));
    }
  }

  // ===== STAKING =====
  async function doStake() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!stakeAmount) return setStatus("Enter stake amount");
    try {
      const amt = parseEther(stakeAmount);
      const tx = await tiffyContract.stakeTokens(amt);
      setStatus("Stake sent: " + tx.hash);
      await tx.wait();
      setStatus("Staked!");
      setStakeAmount("");
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Stake failed: " + (err.message ?? err));
    }
  }

  async function doClaimRewards() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    try {
      const tx = await tiffyContract.claimStakingRewards();
      setStatus("Rewards claim sent: " + tx.hash);
      await tx.wait();
      setStatus("Rewards claimed!");
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Claim rewards failed: " + (err.message ?? err));
    }
  }

  // ===== TRANSFER =====
  async function doTransfer(to: string, amtStr: string) {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    try {
      const amt = parseEther(amtStr);
      const tx = await tiffyContract.transfer(to, amt);
      setStatus("Transfer sent: " + tx.hash);
      await tx.wait();
      setStatus("Transfer done!");
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Transfer failed: " + (err.message ?? err));
    }
  }

  // ===== ADMIN AI SWAPS =====
  function isAdminConnected() {
    return account && account.toLowerCase() === ADMIN_OWNER.toLowerCase();
  }

  async function adminSwapBNBForToken() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!isAdminConnected()) return setStatus("Admin only");
    try {
      const outMin = parseUnits(aiAmountOutMin || "0", 18);
      const tx = await tiffyContract.aiSwapBNBForToken(aiTokenOut, outMin);
      setStatus("BNB→Token swap: " + tx.hash);
      await tx.wait();
      setStatus("Swap executed!");
    } catch (err: any) {
      console.error(err);
      setStatus("Swap failed: " + (err.message ?? err));
    }
  }

  async function adminSwapTokenForBNB() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!isAdminConnected()) return setStatus("Admin only");
    try {
      const amt = parseUnits(aiAmountIn || "0", 18);
      const outMin = parseUnits(aiAmountOutMin || "0", 18);
      const tx = await tiffyContract.aiSwapTokenForBNB(aiTokenIn, amt, outMin);
      setStatus("Token→BNB swap: " + tx.hash);
      await tx.wait();
      setStatus("Swap executed!");
    } catch (err: any) {
      console.error(err);
      setStatus("Swap failed: " + (err.message ?? err));
    }
  }

  async function adminSwapTokenForToken() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!isAdminConnected()) return setStatus("Admin only");
    try {
      const amt = parseUnits(aiAmountIn || "0", 18);
      const outMin = parseUnits(aiAmountOutMin || "0", 18);
      const tx = await tiffyContract.aiSwapTokenForToken(aiTokenIn, aiTokenOut, amt, outMin);
      setStatus("Token→Token swap: " + tx.hash);
      await tx.wait();
      setStatus("Swap executed!");
    } catch (err: any) {
      console.error(err);
      setStatus("Swap failed: " + (err.message ?? err));
    }
  }

  // ===== UI =====
  return (
    <div style={{ fontFamily: "Arial", maxWidth: 900, margin: "20px auto", padding: 20 }}>
      <h2>TiffyAI Frontend</h2>

      {!account ? (
        <button onClick={connect}>Connect Wallet</button>
      ) : (
        <p>
          Connected: {shortAddr(account)}{" "}
          {isAdminConnected() && <span style={{ color: "green" }}>(ADMIN)</span>}
        </p>
      )}

      <div style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}>
        <h3>Account Info</h3>
        <div>Balance: {balance} TIFFY</div>
        <div>Fixed Claim Fee: {fixedFee} BNB</div>
        <div>Last Claim: {lastClaimTs ? new Date(lastClaimTs * 1000).toLocaleString() : "n/a"}</div>
        <button onClick={fetchOnchain}>Refresh</button>
        <button onClick={doClaim}>Claim Daily</button>
      </div>

      <div style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}>
        <h3>Staking</h3>
        <input value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} placeholder="Amount TIFFY" />
        <button onClick={doStake}>Stake</button>
        <button onClick={doClaimRewards}>Claim Rewards</button>
      </div>

      <div style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}>
        <h3>Transfer</h3>
        <TransferForm onTransfer={doTransfer} />
      </div>

      {isAdminConnected() && (
        <div style={{ border: "2px solid orange", padding: 12, marginBottom: 12 }}>
          <h3>Admin AI Swaps</h3>
          <input placeholder="Token In" value={aiTokenIn} onChange={(e) => setAiTokenIn(e.target.value)} />
          <input placeholder="Token Out" value={aiTokenOut} onChange={(e) => setAiTokenOut(e.target.value)} />
          <input placeholder="Amount In" value={aiAmountIn} onChange={(e) => setAiAmountIn(e.target.value)} />
          <input placeholder="Amount Out Min" value={aiAmountOutMin} onChange={(e) => setAiAmountOutMin(e.target.value)} />
          <div>
            <button onClick={adminSwapBNBForToken}>BNB → Token</button>
            <button onClick={adminSwapTokenForBNB}>Token → BNB</button>
            <button onClick={adminSwapTokenForToken}>Token → Token</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, color: "#666" }}>Status: {status}</div>
    </div>
  );
}

// Small transfer form component
function TransferForm({ onTransfer }: { onTransfer: (to: string, amt: string) => void }) {
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  return (
    <div>
      <input placeholder="Recipient" value={to} onChange={(e) => setTo(e.target.value)} />
      <input placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <button onClick={() => onTransfer(to, amt)}>Send</button>
    </div>
  );
}
