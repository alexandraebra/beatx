import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as anchor from '@coral-xyz/anchor'
import BN from 'bn.js'
import { Connection, Keypair, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'

const rpc = process.env.BEATX_RPC_URL ?? 'https://api.devnet.solana.com'
if (new URL(rpc).protocol !== 'https:') throw new Error('e2e:solana requires HTTPS RPC')
const EXPECTED_DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
const EXPECTED_PROGRAM_ID = 'F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h'
const UPGRADEABLE_LOADER_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
const walletAPath = process.env.BEATX_WALLET_A
const walletBPath = process.env.BEATX_WALLET_B
const idlPath = process.env.BEATX_IDL
if (!walletAPath || !walletBPath || !idlPath) throw new Error('BEATX_WALLET_A, BEATX_WALLET_B, and BEATX_IDL are required')

const readKeypair = (path) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))))
const idl = JSON.parse(readFileSync(idlPath, 'utf8'))
if (idl.address !== EXPECTED_PROGRAM_ID) throw new Error('The IDL address does not match the approved Devnet test program ID')
if (!Array.isArray(idl.instructions) || !idl.instructions.some((instruction) => instruction.name === 'withdrawFees')) throw new Error('The IDL does not match the migrated Token-2022 program interface')
const programId = new PublicKey(idl.address)
const connection = new Connection(rpc, 'confirmed')
if (await connection.getGenesisHash() !== EXPECTED_DEVNET_GENESIS) throw new Error('RPC genesis hash is not the official Solana Devnet')
const programInfo = await connection.getAccountInfo(programId)
if (!programInfo || !programInfo.executable || !programInfo.owner.equals(UPGRADEABLE_LOADER_ID) || programInfo.data.length < 36 || programInfo.data.readUInt32LE(0) !== 2) throw new Error('BeatX program account is missing or is not a valid upgradeable program')
const programData = new PublicKey(programInfo.data.subarray(4, 36))
const programDataInfo = await connection.getAccountInfo(programData)
if (!programDataInfo || !programDataInfo.owner.equals(UPGRADEABLE_LOADER_ID) || programDataInfo.data.length < 13 || programDataInfo.data.readUInt32LE(0) !== 3) throw new Error('BeatX ProgramData account is invalid')
const keypairA = readKeypair(walletAPath)
const keypairB = readKeypair(walletBPath)
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypairA), { commitment: 'confirmed' })
const program = new anchor.Program(idl, provider)
const policyMutationRejected = !program.idl.instructions.some((instruction) => instruction.name === 'updatePolicy')
assert.equal(policyMutationRejected, true)
const [config] = PublicKey.findProgramAddressSync([Buffer.from('protocol')], programId)
const [creator] = PublicKey.findProgramAddressSync([Buffer.from('creator'), keypairA.publicKey.toBuffer()], programId)
const waitUntil = async (unixSeconds) => { while (Math.floor(Date.now() / 1000) < unixSeconds) await new Promise((resolve) => setTimeout(resolve, 1000)) }
const expectFailure = async (label, action) => { try { await action(); throw new Error(`${label}_NOT_REJECTED`) } catch (error) { if (error instanceof Error && error.message === `${label}_NOT_REJECTED`) throw error; return label } }

const setup = {}
if (!(await connection.getAccountInfo(config))) setup.initialize = await program.methods.initializeProtocol(100, 100).accounts({ config, program: programId, programData, authority: keypairA.publicKey, systemProgram: SystemProgram.programId }).signers([keypairA]).rpc()
if (!(await connection.getAccountInfo(creator))) setup.creator = await program.methods.createCreator().accounts({ creator, authority: keypairA.publicKey, systemProgram: SystemProgram.programId }).signers([keypairA]).rpc()

const mint = await createMint(connection, keypairA, keypairA.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID)
const tokenA = await getOrCreateAssociatedTokenAccount(connection, keypairA, mint, keypairA.publicKey, false, 'confirmed', undefined, TOKEN_2022_PROGRAM_ID)
const tokenB = await getOrCreateAssociatedTokenAccount(connection, keypairA, mint, keypairB.publicKey, false, 'confirmed', undefined, TOKEN_2022_PROGRAM_ID)
await mintTo(connection, keypairA, mint, tokenA.address, keypairA, 1_000_000_000n, [], undefined, TOKEN_2022_PROGRAM_ID)
await mintTo(connection, keypairA, mint, tokenB.address, keypairA, 1_000_000_000n, [], undefined, TOKEN_2022_PROGRAM_ID)

const marketId = randomBytes(32)
const [market] = PublicKey.findProgramAddressSync([Buffer.from('market'), keypairA.publicKey.toBuffer(), marketId], programId)
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), market.toBuffer()], programId)
const now = Math.floor(Date.now() / 1000)
const open = now + Number(process.env.BEATX_OPEN_DELAY_SECONDS ?? 90)
const close = now + Number(process.env.BEATX_CLOSE_DELAY_SECONDS ?? 150)
const deadline = now + Number(process.env.BEATX_RESOLUTION_DEADLINE_SECONDS ?? 300)
const policyHash = createHash('sha256').update('beatx-devnet-acceptance-policy').digest()
const optionHashes = [createHash('sha256').update('A').digest(), createHash('sha256').update('B').digest(), createHash('sha256').update('C').digest()]
const create = await program.methods.createMarket(marketId, policyHash, optionHashes, new BN(open), new BN(close), new BN(deadline)).accounts({ config, creator, market, vault, settlementMint: mint, authority: keypairA.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).signers([keypairA]).rpc()
const lock = await program.methods.lockMarket().accounts({ market, authority: keypairA.publicKey }).signers([keypairA]).rpc()
await waitUntil(open)

const [positionA] = PublicKey.findProgramAddressSync([Buffer.from('position'), market.toBuffer(), keypairA.publicKey.toBuffer(), new BN(1).toArrayLike(Buffer, 'le', 8)], programId)
const [positionB] = PublicKey.findProgramAddressSync([Buffer.from('position'), market.toBuffer(), keypairB.publicKey.toBuffer(), new BN(2).toArrayLike(Buffer, 'le', 8)], programId)
const placeA = await program.methods.placePosition(new BN(1), 0, new BN(100_000_000)).accounts({ market, position: positionA, vault, settlementMint: mint, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([keypairA]).rpc()
const placeB = await program.methods.placePosition(new BN(2), 1, new BN(100_000_000)).accounts({ market, position: positionB, vault, settlementMint: mint, owner: keypairB.publicKey, ownerTokenAccount: tokenB.address, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([keypairB]).rpc()
await waitUntil(close)
const closeTx = await program.methods.closeMarket().accounts({ market, authority: keypairA.publicKey }).signers([keypairA]).rpc()

const unauthorizedResolutionRejected = await expectFailure('UNAUTHORIZED_RESOLUTION', () => program.methods.submitResolution(0, Buffer.alloc(32, 7)).accounts({ market, config, authority: keypairB.publicKey }).signers([keypairB]).rpc())
const preResolutionClaimRejected = await expectFailure('PRE_RESOLUTION_CLAIM', () => program.methods.claim().accounts({ market, position: positionA, vault, settlementMint: mint, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairA]).rpc())
const latePosition = PublicKey.findProgramAddressSync([Buffer.from('position'), market.toBuffer(), keypairB.publicKey.toBuffer(), new BN(3).toArrayLike(Buffer, 'le', 8)], programId)[0]
const latePositionRejected = await expectFailure('LATE_POSITION', () => program.methods.placePosition(new BN(3), 1, new BN(100_000_000)).accounts({ market, position: latePosition, vault, settlementMint: mint, owner: keypairB.publicKey, ownerTokenAccount: tokenB.address, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([keypairB]).rpc())

const evidenceHash = createHash('sha256').update('beatx-devnet-acceptance-evidence').digest()
const emptyWinningOptionRejected = await expectFailure('EMPTY_WINNING_OPTION', () => program.methods.submitResolution(2, evidenceHash).accounts({ market, config, authority: keypairA.publicKey }).signers([keypairA]).rpc())
const submit = await program.methods.submitResolution(0, evidenceHash).accounts({ market, config, authority: keypairA.publicKey }).signers([keypairA]).rpc()
const finalize = await program.methods.finalizeResolution().accounts({ market, config, authority: keypairA.publicKey }).signers([keypairA]).rpc()
const claimA = await program.methods.claim().accounts({ market, position: positionA, vault, settlementMint: mint, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairA]).rpc()
const doubleClaimRejected = await expectFailure('DOUBLE_CLAIM', () => program.methods.claim().accounts({ market, position: positionA, vault, settlementMint: mint, owner: keypairA.publicKey, ownerTokenAccount: tokenA.address, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairA]).rpc())
const claimB = await program.methods.claim().accounts({ market, position: positionB, vault, settlementMint: mint, owner: keypairB.publicKey, ownerTokenAccount: tokenB.address, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairB]).rpc()
const withdrawProtocolFees = await program.methods.withdrawFees(0).accounts({ market, config, vault, settlementMint: mint, recipientTokenAccount: tokenA.address, authority: keypairA.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairA]).rpc()
const withdrawCreatorFees = await program.methods.withdrawFees(1).accounts({ market, config, vault, settlementMint: mint, recipientTokenAccount: tokenA.address, authority: keypairA.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairA]).rpc()
const duplicateFeeWithdrawalRejected = await expectFailure('DUPLICATE_FEE_WITHDRAWAL', () => program.methods.withdrawFees(0).accounts({ market, config, vault, settlementMint: mint, recipientTokenAccount: tokenA.address, authority: keypairA.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID }).signers([keypairA]).rpc())
const state = await program.account.market.fetch(market)
const vaultState = await getAccount(connection, vault, 'confirmed', TOKEN_2022_PROGRAM_ID)
assert.equal(Number(state.status), 4)
assert.equal(Number(state.winningOption), 0)
assert.equal(vaultState.amount, 0n)
assert.equal(state.protocolFeesBase.toString(), '2000000')
assert.equal(state.creatorFeesBase.toString(), '2000000')

console.log(JSON.stringify({ status: 'PASS', cluster: 'devnet', programId: programId.toBase58(), mint: mint.toBase58(), market: market.toBase58(), setup, create, lock, placeA, placeB, close: closeTx, submit, finalize, claimA, claimB, withdrawProtocolFees, withdrawCreatorFees, policyMutationRejected, unauthorizedResolutionRejected, preResolutionClaimRejected, latePositionRejected, emptyWinningOptionRejected, doubleClaimRejected, duplicateFeeWithdrawalRejected, vaultBaseUnits: vaultState.amount.toString(), protocolFeesBaseUnits: state.protocolFeesBase.toString(), creatorFeesBaseUnits: state.creatorFeesBase.toString() }))
