import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  WalletDisconnectButton,
  WalletMultiButton
} from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildCreateTaskTransaction,
  buildDeleteTaskTransaction,
  buildUpdateTaskTransaction,
  fetchTasksForAuthority,
  getProgramId,
  sendAndConfirmWalletTransaction,
  type TodoTask
} from "./lib/todo";

const explorerCluster = "testnet";

function formatWallet(publicKey: PublicKey | null): string {
  if (!publicKey) {
    return "Not connected";
  }

  const address = publicKey.toBase58();
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function signatureLink(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${explorerCluster}`;
}

function accountLink(address: PublicKey): string {
  return `https://explorer.solana.com/address/${address.toBase58()}?cluster=${explorerCluster}`;
}

function App() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction, signTransaction } = useWallet();
  const programId = useMemo(() => getProgramId(), []);

  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [taskId, setTaskId] = useState("1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect a wallet to manage tasks.");
  const [error, setError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const editingTask =
    editingKey === null
      ? null
      : tasks.find((task) => task.publicKey.toBase58() === editingKey) ?? null;

  const describedTasks = tasks.filter((task) => task.description.trim().length > 0).length;
  const nextSuggestedId =
    tasks.length === 0 ? "1" : (tasks[tasks.length - 1].id + 1n).toString();

  useEffect(() => {
    if (!connected || !publicKey) {
      setTasks([]);
      setEditingKey(null);
      setStatus("Connect a wallet to load your testnet tasks.");
      return;
    }

    void refreshTasks();
  }, [connected, publicKey, programId, connection]);

  useEffect(() => {
    if (editingKey !== null && editingTask === null) {
      setEditingKey(null);
      setEditTitle("");
      setEditDescription("");
    }
  }, [editingKey, editingTask]);

  async function refreshTasks() {
    if (!publicKey) {
      return;
    }

    setError(null);
    setBusyAction((current) => current ?? "refresh");

    try {
      const accounts = await fetchTasksForAuthority(connection, publicKey, programId);
      setTasks(accounts);
      setStatus(
        accounts.length === 0
          ? "No tasks yet. Create one with a signed testnet transaction."
          : `Loaded ${accounts.length} wallet-scoped task account${
              accounts.length === 1 ? "" : "s"
            }.`
      );
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : "Unable to load tasks.";
      setError(message);
    } finally {
      setBusyAction(null);
    }
  }

  function startEditing(task: TodoTask) {
    setEditingKey(task.publicKey.toBase58());
    setEditTitle(task.title);
    setEditDescription(task.description);
    setError(null);
    setStatus(`Editing task ${task.id.toString()}. Submit a signed update when ready.`);
  }

  function resetEditingState() {
    setEditingKey(null);
    setEditTitle("");
    setEditDescription("");
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publicKey || !connected) {
      setError("Connect a wallet before creating a task.");
      return;
    }

    const parsedId = Number(taskId);
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!Number.isInteger(parsedId) || parsedId < 0) {
      setError("Task ID must be a non-negative integer.");
      return;
    }

    if (normalizedTitle.length === 0) {
      setError("Title is required.");
      return;
    }

    if (tasks.some((task) => task.id === BigInt(parsedId))) {
      setError(`Task ${parsedId} already exists for this wallet. Choose another ID.`);
      return;
    }

    setBusyAction("create");
    setError(null);
    setStatus("Requesting wallet approval for a testnet create transaction...");

    try {
      const transaction = buildCreateTaskTransaction({
        authority: publicKey,
        id: BigInt(parsedId),
        title: normalizedTitle,
        description: normalizedDescription,
        programId
      });

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        payer: publicKey,
        transaction,
        signTransaction,
        sendTransaction
      });

      setLastSignature(signature);
      setStatus(`Task ${parsedId} created on testnet.`);
      setTitle("");
      setDescription("");
      setTaskId((BigInt(parsedId) + 1n).toString());
      await refreshTasks();
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Create transaction failed.";
      setError(message);
      setStatus("The create flow did not complete.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publicKey || !connected || !editingTask) {
      setError("Choose a task to edit after connecting a wallet.");
      return;
    }

    const nextTitle = editTitle.trim();
    const nextDescription = editDescription.trim();
    const titleChange = nextTitle === editingTask.title ? null : nextTitle;
    const descriptionChange =
      nextDescription === editingTask.description ? null : nextDescription;

    if (nextTitle.length === 0) {
      setError("Title is required.");
      return;
    }

    if (titleChange === null && descriptionChange === null) {
      setError("Change the title or description before sending an update.");
      return;
    }

    setBusyAction("update");
    setError(null);
    setStatus("Requesting wallet approval for a testnet update transaction...");

    try {
      const transaction = buildUpdateTaskTransaction({
        authority: publicKey,
        id: editingTask.id,
        title: titleChange,
        description: descriptionChange,
        programId
      });

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        payer: publicKey,
        transaction,
        signTransaction,
        sendTransaction
      });

      setLastSignature(signature);
      setStatus(`Task ${editingTask.id.toString()} updated on testnet.`);
      resetEditingState();
      await refreshTasks();
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Update transaction failed.";
      setError(message);
      setStatus("The update flow did not complete.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteTask(task: TodoTask) {
    if (!publicKey || !connected) {
      setError("Connect a wallet before deleting a task.");
      return;
    }

    const deleteKey = `delete-${task.id.toString()}`;
    setBusyAction(deleteKey);
    setError(null);
    setStatus("Requesting wallet approval for a testnet delete transaction...");

    try {
      const transaction = buildDeleteTaskTransaction({
        authority: publicKey,
        id: task.id,
        programId
      });

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        payer: publicKey,
        transaction,
        signTransaction,
        sendTransaction
      });

      setLastSignature(signature);
      setStatus(`Task ${task.id.toString()} deleted on testnet.`);

      if (editingKey === task.publicKey.toBase58()) {
        resetEditingState();
      }

      await refreshTasks();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Delete transaction failed.";
      setError(message);
      setStatus("The delete flow did not complete.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Native Solana Todo</p>
          <h1>Run your on-chain tasks from a cleaner, wallet-first workspace.</h1>
          <p className="lede">
            Create, update, refresh, and delete wallet-owned task accounts through real
            signed transactions on Solana testnet. The UI now treats the app like a
            compact operations dashboard instead of a demo form.
          </p>

          <div className="hero__meta">
            <span>{connected ? "Wallet connected" : "Wallet disconnected"}</span>
            <span>{tasks.length} on-chain task{tasks.length === 1 ? "" : "s"}</span>
            <span>Suggested next ID: {nextSuggestedId}</span>
          </div>
        </div>

        <div className="hero__rail">
          <article className="info-card info-card--wallet">
            <p className="info-card__label">Wallet Session</p>
            <div className="info-card__value">{formatWallet(publicKey)}</div>
            <p className="info-card__text">
              Sign transactions to create or mutate wallet-scoped PDA task accounts.
            </p>
            <div className="hero__actions">
              <WalletMultiButton />
              <WalletDisconnectButton />
            </div>
          </article>
        </div>
      </section>

      <section className="dashboard">
        <div className="dashboard__forms">
          <article className="panel panel--form">
            <div className="panel__header">
              <div>
                <p className="panel__label">Create Task</p>
                <h2>Submit a signed transaction</h2>
              </div>
              <button
                className="ghost-button"
                disabled={!connected || busyAction !== null}
                onClick={() => void refreshTasks()}
                type="button"
              >
                {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <p className="hint">
              Fund the connected wallet with testnet SOL first. Each task account is
              derived from your wallet plus the numeric task ID.
            </p>

            <form className="task-form" onSubmit={handleCreateTask}>
              <label>
                Task ID
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => setTaskId(event.target.value)}
                  placeholder={nextSuggestedId}
                  type="number"
                  value={taskId}
                />
              </label>

              <label>
                Title
                <input
                  maxLength={64}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ship the testnet wallet flow"
                  value={title}
                />
              </label>

              <label>
                Description
                <textarea
                  maxLength={64}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Keep it short: every task stores fixed-length text on-chain."
                  rows={5}
                  value={description}
                />
              </label>

              <div className="form-actions">
                <button
                  className="primary-button"
                  disabled={!connected || busyAction !== null}
                  type="submit"
                >
                  {busyAction === "create" ? "Sending..." : "Create Task"}
                </button>
                <span className="form-note">Titles and descriptions are capped at 64 bytes.</span>
              </div>
            </form>
          </article>

          <article className="panel panel--status">
            <div className="panel__header">
              <div>
                <p className="panel__label">Session Feed</p>
                <h2>Latest activity</h2>
              </div>
              <span className={`badge${error ? " badge--alert" : ""}`}>
                {error ? "Needs attention" : "Healthy"}
              </span>
            </div>

            <p className="status-copy">{status}</p>
            {error ? <p className="status-card__error">{error}</p> : null}
            {lastSignature ? (
              <a href={signatureLink(lastSignature)} rel="noreferrer" target="_blank">
                View latest transaction in Solana Explorer
              </a>
            ) : null}
          </article>

          <article className="panel panel--editor">
            <div className="panel__header">
              <div>
                <p className="panel__label">Edit Task</p>
                <h2>{editingTask ? `Task #${editingTask.id.toString()}` : "Select a task"}</h2>
              </div>
              {editingTask ? (
                <button
                  className="ghost-button"
                  disabled={busyAction !== null}
                  onClick={resetEditingState}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {editingTask ? (
              <form className="task-form" onSubmit={handleUpdateTask}>
                <label>
                  Title
                  <input
                    maxLength={64}
                    onChange={(event) => setEditTitle(event.target.value)}
                    value={editTitle}
                  />
                </label>

                <label>
                  Description
                  <textarea
                    maxLength={64}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={5}
                    value={editDescription}
                  />
                </label>

                <div className="form-actions">
                  <button
                    className="primary-button"
                    disabled={!connected || busyAction !== null}
                    type="submit"
                  >
                    {busyAction === "update" ? "Updating..." : "Update Task"}
                  </button>
                  <span className="form-note">
                    Only changed fields are included in the update transaction.
                  </span>
                </div>
              </form>
            ) : (
              <div className="empty-state">
                <p>Select a task card from the list to load it into the editor.</p>
              </div>
            )}
          </article>
        </div>

        <article className="panel panel--tasks">
          <div className="panel__header">
            <div>
              <p className="panel__label">Task Accounts</p>
              <h2>Wallet-scoped PDAs</h2>
            </div>
            <span className="badge">{tasks.length} loaded</span>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-card__label">Total Tasks</span>
              <strong>{tasks.length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">With Notes</span>
              <strong>{describedTasks}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Next ID</span>
              <strong>{nextSuggestedId}</strong>
            </div>
          </div>

          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty-state empty-state--large">
                <p>No task accounts found for this wallet on testnet.</p>
                <span>Create your first one from the form on the left.</span>
              </div>
            ) : (
              tasks.map((task) => {
                const deleteKey = `delete-${task.id.toString()}`;
                const isEditing = editingKey === task.publicKey.toBase58();

                return (
                  <article
                    className={`task-card${isEditing ? " task-card--active" : ""}`}
                    key={task.publicKey.toBase58()}
                  >
                    <div className="task-card__header">
                      <div>
                        <p className="task-card__id">Task #{task.id.toString()}</p>
                        <h3>{task.title || "Untitled task"}</h3>
                      </div>
                      <div className="task-card__actions">
                        <button
                          className="ghost-button"
                          disabled={!connected || busyAction !== null}
                          onClick={() => startEditing(task)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="danger-button"
                          disabled={!connected || busyAction !== null}
                          onClick={() => void handleDeleteTask(task)}
                          type="button"
                        >
                          {busyAction === deleteKey ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    <p className="task-card__description">
                      {task.description || "No description saved."}
                    </p>

                    <div className="task-card__meta">
                      <span>Bump: {task.bump}</span>
                      <span>Authority: {formatWallet(task.authority)}</span>
                      <a href={accountLink(task.publicKey)} rel="noreferrer" target="_blank">
                        View PDA in Explorer
                      </a>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

export default App;
