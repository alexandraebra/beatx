import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as anchor from '@coral-xyz/anchor'
import BN from 'bn.js'
import { Connection, Keypair, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'

const rpc = process.env.BEATX_RPC_URL ?? 'https://api.devnet.solana.com'
const walletAPath = process.env.BEATX_WALLET_A
const walletBPath = process.env.BEATX_WALLET_B
const idlPath = process.env.BEATX_IDL
if (!walletAPath || !walletBPath || !idlPath) throw new Error('BEATX_WALLET_A, BEATX_WALLET_B, and BEATX_IDL are required')

const readKeypair = (path) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))))
const keypairA = readKeypair(walletAPath)
const keypairB = readKeypair(walletBPath)
const idl = JSON.parse(readFileSync(idlPath, 'utf8'))
const programId = new PublicKey(idl.address)
const connection = new Connection(rpc, 'confirmed')
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypairA), { commitment: 'confirmed' })
const program = new anchor.Program(idl, provider)
const policyMutationRejected = !program.idl.instructions.some((instruction) => instruction.name === 'updatePolicy')
assert.equal(policyMutationRejected, true)
const [config] = PublicKey.findProgramAddressSync([Buffer.from('protocol')], programId)
const [creator] = PublicKey.findProgramAddressSync([Buffer.from('creator'), keypairA.publicKey.toBuffer()], programId)
const waitUntil = async (unixSeconds) => { while (Math.floor(Date.now() / 1000) < unixSeconds) await new Promise((resolve) => setTimeout(resolve, 1000)) }
const expectFailure = async (label, action) => { try { await action(); throw new Error(`${label}_NOT_REJECTED`) } catch (error) { if (error instanceof Error && error.message === `${label}_NOT_REJECTED`) throw error; return label } }

const setup = {}
if (!(await connection.getAccountInfo(config))) setup.initialize = await program.methods.initializeProtocol(100, 100).accounts({ config, authority: keypairA.publicKey, systemProgram: SystemProgram.programId }).signers([keypairA]).rpc()
if (!(await connection.getAccountInfo(creator))) setup.creator = await program.methods.createCreator().accounts({ creator, authority: keypairA.publicKey, systemProgram: SystemProgram.programId }).signers([keypairA]).rpc()

const mint = await createMint(connection, keypairA, keypairA.publicKey, null, 6)
const tokenA = await getOrCreateAssociatedTokenAccount(connection, keypairA, mint, keypairA.publicKey)
const tokenB = await getOrCreateAssociatedTokenAccount(connection, keypairA, mint, keypairB.publicKey)
await mintTo(connection, keypairA, mint, tokenA.address, keypairA, 1_000_000_000n)
await mintTo(connection, keypairA, mint, tokenB.address, keypairA, 1_000_000_000n)

const marketId = randomBytes(32)
const [market] = PublicKey.findProgramAddressSync([Buffer.from('market'), keypairA.publicKey.toBuffer(), marketId], programId)
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), market.toBuffer()], programId)
const now = Math.floor(Date.now() / 1000)
const open = now + Number(process.env.BEATX_OPEN_DELAY_SECONDS ?? 90)
const close = now + Number(process.env.BEATX_CLOSE_DELAY_SECONDS ?? 150)
const deadline = now + Number(process.env.BEATX_RESOLUTION_DEADLINE_SECONDS ?? 300)
const policyHash = createHash('sha256').update('beatx-devnet-acceptance-policy').digest()
const optionHashes = [createHash('sha256').update('A').digest(), createHash('sha256').update('B').digest()]
const create = await program.methods.createMarket(marketId, policyHash, optionHashes, new BN(open), new BN(close), new BN(deadline)).accounts({ config, creator, market, vault, settlementMint: mint, authority: keypairA.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).signers([keypairA]).rpc()
const lock = await program.methods.lockMarket().accounts({ market, authority: keypairA.publicKey }).signers([keypairA]).rpc()
await waitUntil(open)

const [positionA] = PublicKey.findProgramAddressSync([Buffer.from('position'), market.toBuffer(), keypairA.publicKey.toBuffer(), new BN(1).toArrayLike(Buffer, 'le', 8)], programId)
const [positionB] = PublicKey.findProgramAddressSync([Buffer.from('position'), market.toBuffer(), keypairB.publicKey.toBuffer(), new BN(2).toArrayLike(Buffer, 'le', 8)], programId)
const placeA = await program.methods.placePosition(new BN(1), 0, new BN(100_000_000)).accounts({ market, position: positionA, vault, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([keypairA]).rpc()
const placeB = await program.methods.placePosition(new BN(2), 1, new BN(100_000_000)).accounts({ market, position: positionB, vault, owner: keypairB.publicKey, ownerTokenAccount: tokenB.address, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([keypairB]).rpc()
await waitUntil(close)
const closeTx = await program.methods.closeMarket().accounts({ market, authority: keypairA.publicKey }).signers([keypairA]).rpc()

const unauthorizedResolutionRejected = await expectFailure('UNAUTHORIZED_RESOLUTION', () => program.methods.submitResolution(0, Buffer.alloc(32, 7)).accounts({ market, config, authority: keypairB.publicKey }).signers([keypairB]).rpc())
const preResolutionClaimRejected = await expectFailure('PRE_RESOLUTION_CLAIM', () => program.methods.claim().accounts({ market, position: positionA, vault, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_PROGRAM_ID }).signers([keypairA]).rpc())
const latePosition = PublicKey.findProgramAddressSync([Buffer.from('position'), market.toBuffer(), keypairB.publicKey.toBuffer(), new BN(3).toArrayLike(Buffer, 'le', 8)], programId)[0]
const latePositionRejected = await expectFailure('LATE_POSITION', () => program.methods.placePosition(new BN(3), 1, new BN(100_000_000)).accounts({ market, position: latePosition, vault, owner: keypairB.publicKey, ownerTokenAccount: tokenB.address, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([keypairB]).rpc())

const evidenceHash = createHash('sha256').update('beatx-devnet-acceptance-evidence').digest()
const submit = await program.methods.submitResolution(0, evidenceHash).accounts({ market, config, authority: keypairA.publicKey }).signers([keypairA]).rpc()
const finalize = await program.methods.finalizeResolution().accounts({ market, config, authority: keypairA.publicKey }).signers([keypairA]).rpc()
const claimA = await program.methods.claim().accounts({ market, position: positionA, vault, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_PROGRAM_ID }).signers([keypairA]).rpc()
const doubleClaimRejected = await expectFailure('DOUBLE_CLAIM', () => program.methods.claim().accounts({ market, position: positionA, vault, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_PROGRAM_ID }).signers([keypairA]).rpc())
const claimB = await program.methods.claim().accounts({ market, position: positionB, vault, owner: keypairB.publicKey, ownerTokenAccount: tokenB.address, tokenProgram: TOKEN_PROGRAM_ID }).signers([keypairB]).rpc()
const state = await program.account.market.fetch(market)
const vaultState = await getAccount(connection, vault)
assert.equal(Number(state.status), 4)
assert.equal(Number(state.winningOption), 0)
assert.equal(vaultState.amount, 4_000_000n)
assert.equal(state.protocolFeesBase.toString(), '2000000')
assert.equal(state.creatorFeesBase.toString(), '2000000')

console.log(JSON.stringify({ status: 'PASS', programId: programId.toBase58(), mint: mint.toBase58(), market: market.toBase58(), setup, create, lock, placeA, placeB, close: closeTx, submit, finalize, claimA, claimB, policyMutationRejected, unauthorizedResolutionRejected, preResolutionClaimRejected, latePositionRejected, doubleClaimRejected, vaultBaseUnits: vaultState.amount.toString(), protocolFeesBaseUnits: state.protocolFeesBase.toString(), creatorFeesBaseUnits: state.creatorFeesBase.toString() }))
