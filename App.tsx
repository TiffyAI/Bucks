import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import TiffyAI from "./abi/TiffyAI.json"; // make sure ABI file is in src/abi/

// ⚡ Replace with your deployed contract address
const CONTRACT_ADDRESS = "0xE488253DD6B4D31431142F1b7601C96f24Fb7dd5";

const App: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [stakeAmount, setStakeAmount] = useState<string>("");

  // ========== WALLET CONNECT ==========
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const ethProvider = new ethers.BrowserProvider(window.ethereum);
        await ethProvider.send("eth_requestAccounts", []);
        const signer = await ethProvider.getSigner();
        const address = await signer.getAddress();

        setProvider(ethProvider);
        setAccount(address);

        const tiffy = new ethers.Contract(CONTRACT_ADDRESS, TiffyAI.abi, signer);
        setContract(tiffy);
      } catch (err: any) {
        alert("Connection failed: " + err.message);
      }
    } else {
      alert("MetaMask not found!");
    }
  };

  // ========== BALANCE ==========
  const loadBalance = async () => {
    if (contract && account) {
      try {
        const bal = await contract.balanceOf(account);
        setBalance(ethers.formatUnits(bal, 18));
      } catch (err: any) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    if (contract && account) {
      loadBalance();
    }
  }, [contract, account]);

  // ========== CLAIM ==========
  const claim = async () => {
    if (contract) {
      try {
        const tx = await contract.claim({
          value: ethers.parseEther("0.0015"), // matches FIXED_BNB_FEE
        });
        await tx.wait();
        alert("Claim successful!");
        loadBalance();
      } catch (err: any) {
        alert("Claim failed: " + err.message);
      }
    }
  };

  // ========== STAKING ==========
  const stakeTokens = async () => {
    if (contract && stakeAmount) {
      try {
        const parsed = ethers.parseUnits(stakeAmount, 18);
        const tx = await contract.stakeTokens(parsed);
        await tx.wait();
        alert("Staked successfully!");
        loadBalance();
      } catch (err: any) {
        alert("Stake failed: " + err.message);
      }
    }
  };

  const claimStakingRewards = async () => {
    if (contract) {
      try {
        const tx = await contract.claimStakingRewards();
        await tx.wait();
        alert("Rewards claimed!");
        loadBalance();
      } catch (err: any) {
        alert("Claim failed: " + err.message);
      }
    }
  };

  // ========== AI SWAPS ==========
  const aiSwapBNBForToken = async (tokenOut: string, amountOutMin: string) => {
    if (contract) {
      try {
        const tx = await contract.aiSwapBNBForToken(
          tokenOut,
          ethers.parseUnits(amountOutMin, 18)
        );
        await tx.wait();
        alert("AI Swap BNB → Token executed!");
      } catch (err: any) {
        alert("Swap failed: " + err.message);
      }
    }
  };

  const aiSwapTokenForBNB = async (
    tokenIn: string,
    amountIn: string,
    amountOutMin: string
  ) => {
    if (contract) {
      try {
        const tx = await contract.aiSwapTokenForBNB(
          tokenIn,
          ethers.parseUnits(amountIn, 18),
          ethers.parseUnits(amountOutMin, 18)
        );
        await tx.wait();
        alert("AI Swap Token → BNB executed!");
      } catch (err: any) {
        alert("Swap failed: " + err.message);
      }
    }
  };

  const aiSwapTokenForToken = async (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMin: string
  ) => {
    if (contract) {
      try {
        const tx = await contract.aiSwapTokenForToken(
          tokenIn,
          tokenOut,
          ethers.parseUnits(amountIn, 18),
          ethers.parseUnits(amountOutMin, 18)
        );
        await tx.wait();
        alert("AI Swap Token → Token executed!");
      } catch (err: any) {
        alert("Swap failed: " + err.message);
      }
    }
  };

  // ========== UI ==========
  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>TiffyAI Frontend</h1>

      {!account ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <p>Connected: {account}</p>
      )}

      <h2>Your Balance: {balance} TIFFY</h2>

      <button onClick={claim}>Claim Daily Reward</button>

      <div style={{ marginTop: "20px" }}>
        <input
          type="text"
          placeholder="Amount to stake"
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
        />
        <button onClick={stakeTokens}>Stake Tokens</button>
        <button onClick={claimStakingRewards}>Claim Staking Rewards</button>
      </div>

      <h2 style={{ marginTop: "30px" }}>AI Swap</h2>
      <div>
        <h3>BNB → Token</h3>
        <input type="text" placeholder="Token Out Address" id="bnbTokenOut" />
        <input type="text" placeholder="Min Tokens" id="bnbAmountOutMin" />
        <button
          onClick={() =>
            aiSwapBNBForToken(
              (document.getElementById("bnbTokenOut") as HTMLInputElement).value,
              (document.getElementById("bnbAmountOutMin") as HTMLInputElement)
                .value
            )
          }
        >
          Swap BNB → Token
        </button>
      </div>

      <div>
        <h3>Token → BNB</h3>
        <input type="text" placeholder="Token In Address" id="tokenIn" />
        <input type="text" placeholder="Amount In" id="amountIn" />
        <input type="text" placeholder="Min BNB Out" id="amountOutMin" />
        <button
          onClick={() =>
            aiSwapTokenForBNB(
              (document.getElementById("tokenIn") as HTMLInputElement).value,
              (document.getElementById("amountIn") as HTMLInputElement).value,
              (document.getElementById("amountOutMin") as HTMLInputElement).value
            )
          }
        >
          Swap Token → BNB
        </button>
      </div>

      <div>
        <h3>Token → Token</h3>
        <input type="text" placeholder="Token In Address" id="tIn" />
        <input type="text" placeholder="Token Out Address" id="tOut" />
        <input type="text" placeholder="Amount In" id="tAmountIn" />
        <input type="text" placeholder="Min Tokens Out" id="tAmountOutMin" />
        <button
          onClick={() =>
            aiSwapTokenForToken(
              (document.getElementById("tIn") as HTMLInputElement).value,
              (document.getElementById("tOut") as HTMLInputElement).value,
              (document.getElementById("tAmountIn") as HTMLInputElement).value,
              (document.getElementById("tAmountOutMin") as HTMLInputElement)
                .value
            )
          }
        >
          Swap Token → Token
        </button>
      </div>
    </div>
  );
};

export default App;
