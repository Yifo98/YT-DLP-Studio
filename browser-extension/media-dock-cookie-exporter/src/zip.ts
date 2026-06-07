export type ZipFile = {
  path: string
  content: string | Uint8Array
}

type EncodedZipFile = {
  pathBytes: Uint8Array
  contentBytes: Uint8Array
  crc32: number
  offset: number
  dosTime: number
  dosDate: number
}

const encoder = new TextEncoder()
const crcTable = createCrcTable()

export function buildZip(files: ZipFile[], modifiedAt = new Date()) {
  const encodedFiles: EncodedZipFile[] = []
  const localParts: Uint8Array[] = []
  let offset = 0

  files.forEach((file) => {
    const encoded = encodeFile(file, modifiedAt, offset)
    const localHeader = buildLocalHeader(encoded)
    localParts.push(localHeader, encoded.contentBytes)
    offset += localHeader.byteLength + encoded.contentBytes.byteLength
    encodedFiles.push(encoded)
  })

  const centralParts = encodedFiles.map(buildCentralDirectoryHeader)
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0)
  const centralOffset = offset
  const endRecord = buildEndRecord(encodedFiles.length, centralSize, centralOffset)
  return new Blob([...localParts, ...centralParts, endRecord].map(toArrayBuffer), { type: 'application/zip' })
}

function encodeFile(file: ZipFile, modifiedAt: Date, offset: number): EncodedZipFile {
  const contentBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content
  const pathBytes = encoder.encode(file.path.replace(/^\/+/, '').replace(/\\/g, '/'))
  const { dosTime, dosDate } = toDosDateTime(modifiedAt)
  return {
    pathBytes,
    contentBytes,
    crc32: calculateCrc32(contentBytes),
    offset,
    dosTime,
    dosDate,
  }
}

function buildLocalHeader(file: EncodedZipFile) {
  const buffer = new ArrayBuffer(30 + file.pathBytes.byteLength)
  const view = new DataView(buffer)
  writeUint32(view, 0, 0x04034b50)
  writeUint16(view, 4, 20)
  writeUint16(view, 6, 0x0800)
  writeUint16(view, 8, 0)
  writeUint16(view, 10, file.dosTime)
  writeUint16(view, 12, file.dosDate)
  writeUint32(view, 14, file.crc32)
  writeUint32(view, 18, file.contentBytes.byteLength)
  writeUint32(view, 22, file.contentBytes.byteLength)
  writeUint16(view, 26, file.pathBytes.byteLength)
  writeUint16(view, 28, 0)
  new Uint8Array(buffer, 30).set(file.pathBytes)
  return new Uint8Array(buffer)
}

function buildCentralDirectoryHeader(file: EncodedZipFile) {
  const buffer = new ArrayBuffer(46 + file.pathBytes.byteLength)
  const view = new DataView(buffer)
  writeUint32(view, 0, 0x02014b50)
  writeUint16(view, 4, 20)
  writeUint16(view, 6, 20)
  writeUint16(view, 8, 0x0800)
  writeUint16(view, 10, 0)
  writeUint16(view, 12, file.dosTime)
  writeUint16(view, 14, file.dosDate)
  writeUint32(view, 16, file.crc32)
  writeUint32(view, 20, file.contentBytes.byteLength)
  writeUint32(view, 24, file.contentBytes.byteLength)
  writeUint16(view, 28, file.pathBytes.byteLength)
  writeUint16(view, 30, 0)
  writeUint16(view, 32, 0)
  writeUint16(view, 34, 0)
  writeUint16(view, 36, 0)
  writeUint32(view, 38, 0)
  writeUint32(view, 42, file.offset)
  new Uint8Array(buffer, 46).set(file.pathBytes)
  return new Uint8Array(buffer)
}

function buildEndRecord(fileCount: number, centralSize: number, centralOffset: number) {
  const buffer = new ArrayBuffer(22)
  const view = new DataView(buffer)
  writeUint32(view, 0, 0x06054b50)
  writeUint16(view, 4, 0)
  writeUint16(view, 6, 0)
  writeUint16(view, 8, fileCount)
  writeUint16(view, 10, fileCount)
  writeUint32(view, 12, centralSize)
  writeUint32(view, 16, centralOffset)
  writeUint16(view, 20, 0)
  return new Uint8Array(buffer)
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function toArrayBuffer(bytes: Uint8Array) {
  return new Uint8Array(bytes).buffer
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true)
}

function toDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosTime, dosDate }
}

function createCrcTable() {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

function calculateCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
