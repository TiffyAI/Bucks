// src/App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import TIFFY_ABI from "./tiffyABI.json";

const TIFFY_ADDRESS = "0x...PUT_YOUR_DEPLOYED_ADDRESS_HERE..."; // set your deployed TiffyAI contract address
const ADMIN_OWNER = "0x2a234d5Cc7431B824723c84c8605fD3968BF0255";

declare global {
  interface Window { ethereum?: any; }
}

function shortAddr(a?: string) {
  if (!a) return "";
  return a.slice(0,6) + "..." + a.slice(-4);
}

export default function App() {
  const [provider, setProvider] = useState<ethers.providers.Web3Provider|null>(null);
  const [signer, setSigner] = useState<ethers.Signer|null>(null);
  const [account, setAccount] = useState<string>("");
  const [tiffyContract, setTiffyContract] = useState<ethers.Contract|null>(null);

  const [balance, setBalance] = useState<string>("0");
  const [fixedFee, setFixedFee] = useState<string>("0");
  const [lastClaimTs, setLastClaimTs] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  // admin UI state
  const [aiTokenOut, setAiTokenOut] = useState<string>(""); // tokenOut for aiSwapBNBForToken
  const [aiAmountIn, setAiAmountIn] = useState<string>(""); // amountIn for token swaps
  const [aiAmountOutMin, setAiAmountOutMin] = useState<string>("0");

  useEffect(() => {
    if (window.ethereum) {
      const prov = new ethers.providers.Web3Provider(window.ethereum, "any");
      setProvider(prov);
      const contract = new ethers.Contract(TIFFY_ADDRESS, TIFFY_ABI as any, prov);
      setTiffyContract(contract);
    } else {
      setStatus("No web3 wallet found. Install MetaMask.");
    }
  }, []);

  async function connect() {
    if (!provider) return setStatus("No provider");
    await provider.send("eth_requestAccounts", []);
    const s = provider.getSigner();
    const addr = await s.getAddress();
    setSigner(s);
    setAccount(addr);
    setTiffyContract(new ethers.Contract(TIFFY_ADDRESS, TIFFY_ABI as any, s));
    setStatus("Connected: " + shortAddr(addr));
    fetchOnchain(addr);
    // watch account changes
    window.ethereum.on && window.ethereum.on("accountsChanged", (acs: string[]) => {
      if (acs.length === 0) {
        setAccount("");
        setSigner(null);
      } else {
        setAccount(acs[0]);
        setSigner(provider!.getSigner());
      }
    });
  }

  async function fetchOnchain(addr?: string) {
    if (!tiffyContract || !provider) return;
    try {
      const user = addr ?? account;
      const bal: ethers.BigNumber = await tiffyContract.balanceOf(user);
      setBalance(ethers.utils.formatEther(bal));
      const feeBN: ethers.BigNumber = await tiffyContract.FIXED_BNB_FEE();
      setFixedFee(ethers.utils.formatEther(feeBN));
      const last: ethers.BigNumber = await tiffyContract.lastClaimed(user);
      setLastClaimTs(last.toNumber());
    } catch (err: any) {
      console.error(err);
      setStatus("Failed reading on-chain data: " + (err.message ?? err));
    }
  }

  // pay exactly FIXED_BNB_FEE or zero if exempt
  async function doClaim() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    setStatus("Sending claim tx...");
    try {
      const contractWithSigner = tiffyContract.connect(signer);
      // read FIXED_BNB_FEE to know value (contract enforces equality if not fee-exempt)
      const feeBN: ethers.BigNumber = await tiffyContract.FIXED_BNB_FEE();
      const tx = await contractWithSigner.claim({ value: feeBN });
      setStatus(`Tx sent: ${tx.hash}`);
      await tx.wait();
      setStatus("Claim mined: " + tx.hash);
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Claim failed: " + (err.reason ?? err.message ?? err));
    }
  }

  async function doStake() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!stakeAmount || Number(stakeAmount) <= 0) return setStatus("Enter stake amount > 0");
    try {
      const amt = ethers.utils.parseEther(stakeAmount);
      const tx = await tiffyContract.connect(signer).stakeTokens(amt);
      setStatus("Stake tx sent: " + tx.hash);
      await tx.wait();
      setStatus("Staked. Tx: " + tx.hash);
      setStakeAmount("");
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Stake failed: " + (err.reason ?? err.message ?? err));
    }
  }

  async function doClaimRewards() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    try {
      const tx = await tiffyContract.connect(signer).claimStakingRewards();
      setStatus("Claim rewards tx sent: " + tx.hash);
      await tx.wait();
      setStatus("Rewards claimed: " + tx.hash);
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Claim rewards failed: " + (err.reason ?? err.message ?? err));
    }
  }

  async function doTransfer(to: string, amtStr: string) {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    try {
      const amt = ethers.utils.parseEther(amtStr);
      const tx = await tiffyContract.connect(signer).transfer(to, amt);
      setStatus("Transfer tx sent: " + tx.hash);
      await tx.wait();
      setStatus("Transfer mined: " + tx.hash);
      fetchOnchain();
    } catch (err: any) {
      console.error(err);
      setStatus("Transfer failed: " + (err.reason ?? err.message ?? err));
    }
  }

  // ========== ADMIN: AI swaps ==========
  function isAdminConnected() {
    return account && account.toLowerCase() === ADMIN_OWNER.toLowerCase();
  }

  async function adminSwapBNBForToken() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!isAdminConnected()) return setStatus("Admin only");
    try {
      // This function uses contract's ETH balance -> swapping entire balance
      const tx = await tiffyContract.connect(signer).aiSwapBNBForToken(aiTokenOut, ethers.BigNumber.from(aiAmountOutMin || "0"));
      setStatus("aiSwapBNBForToken tx: " + tx.hash);
      await tx.wait();
      setStatus("AI swap executed: " + tx.hash);
    } catch (err: any) {
      console.error(err);
      setStatus("AI swap failed: " + (err.reason ?? err.message ?? err));
    }
  }

  async function adminSwapTokenForBNB() {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!isAdminConnected()) return setStatus("Admin only");
    try {
      const amt = ethers.utils.parseEther(aiAmountIn || "0");
      const outMin = ethers.BigNumber.from(aiAmountOutMin || "0");
      const tx = await tiffyContract.connect(signer).aiSwapTokenForBNB(aiTokenOut, amt, outMin);
      setStatus("aiSwapTokenForBNB tx: " + tx.hash);
      await tx.wait();
      setStatus("AI swap executed: " + tx.hash);
    } catch (err: any) {
      console.error(err);
      setStatus("AI swap failed: " + (err.reason ?? err.message ?? err));
    }
  }

  async function adminSwapTokenForToken(tokenIn: string, tokenOut: string) {
    if (!tiffyContract || !signer) return setStatus("Connect wallet first");
    if (!isAdminConnected()) return setStatus("Admin only");
    try {
      const amt = ethers.utils.parseEther(aiAmountIn || "0");
      const outMin = ethers.BigNumber.from(aiAmountOutMin || "0");
      const tx = await tiffyContract.connect(signer).aiSwapTokenForToken(tokenIn, tokenOut, amt, outMin);
      setStatus("aiSwapTokenForToken tx: " + tx.hash);
      await tx.wait();
      setStatus("AI token->token swap executed: " + tx.hash);
    } catch (err: any) {
      console.error(err);
      setStatus("AI swap failed: " + (err.reason ?? err.message ?? err));
    }
  }

  // UI
  return (
    <div style={{fontFamily: "Inter, sans-serif", maxWidth: 900, margin: "20px auto", padding: 20}}>
      <h2>TiffyAI Frontend</h2>
      <div style={{marginBottom:12}}>
        {!account ? (
          <button onClick={connect}>Connect Wallet</button>
        ) : (
          <div>
            <strong>Connected:</strong> {shortAddr(account)} {isAdminConnected() && <span style={{color:"green"}}>(ADMIN)</span>}
          </div>
        )}
      </div>

      <div style={{border:"1px solid #ddd", padding:12, marginBottom:12}}>
        <h3>Account & Token Info</h3>
        <div><strong>TIFFY Balance:</strong> {balance}</div>
        <div><strong>Fixed BNB Fee (claim):</strong> {fixedFee} BNB</div>
        <div><strong>Last claim ts:</strong> { lastClaimTs ? new Date(lastClaimTs * 1000).toLocaleString() : "n/a" }</div>
        <div style={{marginTop:8}}>
          <button onClick={() => fetchOnchain()} style={{marginRight:8}}>Refresh</button>
          <button onClick={doClaim} style={{marginRight:8}}>Claim (payable)</button>
        </div>
      </div>

      <div style={{border:"1px solid #ddd", padding:12, marginBottom:12}}>
        <h3>Staking</h3>
        <div>
          <input placeholder="amount (TIFFY)" value={stakeAmount} onChange={e=>setStakeAmount(e.target.value)} />
          <button onClick={doStake} style={{marginLeft:8}}>Stake</button>
        </div>
        <div style={{marginTop:8}}>
          <button onClick={doClaimRewards}>Claim Staking Rewards</button>
        </div>
      </div>

      <div style={{border:"1px solid #ddd", padding:12, marginBottom:12}}>
        <h3>Transfer TIFFY</h3>
        <TransferForm onTransfer={doTransfer} />
      </div>

      {isAdminConnected() && (
        <div style={{border:"2px solid #ffcc00", padding:12, marginBottom:12}}>
          <h3>Admin: AI Swap Controls (OWNER ONLY)</h3>
          <div style={{marginBottom:8}}>
            <input placeholder="token address (tokenOut or tokenIn)" value={aiTokenOut} onChange={e=>setAiTokenOut(e.target.value)} style={{width:"60%"}} />
          </div>
          <div style={{marginBottom:8}}>
            <input placeholder="amountIn (in token's decimals as ETH format)" value={aiAmountIn} onChange={e=>setAiAmountIn(e.target.value)} style={{marginRight:8}} />
            <input placeholder="amountOutMin (integer or 0)" value={aiAmountOutMin} onChange={e=>setAiAmountOutMin(e.target.value)} />
          </div>
          <div>
            <button onClick={adminSwapBNBForToken} style={{marginRight:8}}>aiSwapBNBForToken (use contract ETH balance)</button>
            <button onClick={adminSwapTokenForBNB} style={{marginRight:8}}>aiSwapTokenForBNB</button>
            <button onClick={() => adminSwapTokenForToken(aiTokenOut, aiTokenOut)} disabled>aiSwapTokenForToken (provide tokenIn & tokenOut)</button>
          </div>
        </div>
      )}

      <div style={{marginTop:10, color:"#666"}}><strong>Status:</strong> {status}</div>
    </div>
  );
}

// small component for transfer form
function TransferForm({ onTransfer }: { onTransfer: (to:string, amt:string)=>void }) {
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  return (
    <div>
      <input placeholder="recipient address" value={to} onChange={e=>setTo(e.target.value)} style={{width:"55%", marginRight:8}} />
      <input placeholder="amount (TIFFY)" value={amt} onChange={e=>setAmt(e.target.value)} style={{width:"20%", marginRight:8}} />
      <button onClick={() => onTransfer(to, amt)}>Transfer</button>
    </div>
  );
}
