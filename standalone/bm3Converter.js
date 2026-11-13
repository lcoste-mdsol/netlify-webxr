import JSZip from 'jszip';

const GLTF_COMPONENT_TYPE = {
  BYTE: 5120,
  UNSIGNED_BYTE: 5121,
  SHORT: 5122,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
};

const COMPONENT_SIZE = {
  BYTE: 1,
  UNSIGNED_BYTE: 1,
  SHORT: 2,
  UNSIGNED_SHORT: 2,
  UNSIGNED_INT: 4,
  FLOAT: 4,
};

const DIM_TO_TYPE = {
  1: 'SCALAR',
  2: 'VEC2',
  3: 'VEC3',
  4: 'VEC4',
  9: 'MAT3',
  16: 'MAT4',
};

const PRIMITIVE_MODE = {
  POINTS: 0,
  LINES: 1,
  LINE_LOOP: 2,
  LINE_STRIP: 3,
  TRIANGLES: 4,
  TRIANGLE_STRIP: 5,
  TRIANGLE_FAN: 6,
};

const UNIT_TO_METERS = {
  m: 1.0,
  meter: 1.0,
  meters: 1.0,
  metre: 1.0,
  metres: 1.0,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  centimetre: 0.01,
  centimetres: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  millimetre: 0.001,
  millimetres: 0.001,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
};

const MIMETYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  bin: 'application/octet-stream',
};

export class BM3Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'BM3Error';
  }
}

export class WarningLog {
  constructor() {
    this.messages = [];
  }
  warn(message) {
    this.messages.push(message);
    console.warn(`[BM3 Warning] ${message}`);
  }
}

export class BM3Source {
  constructor() {
    this.zip = null;
    this.fileCache = new Map();
  }

  async loadFromFile(file) {
    const arrayBuffer = file instanceof Blob ? await file.arrayBuffer() : file;
    this.zip = await JSZip.loadAsync(arrayBuffer);
  }

  async readBytes(relativePath) {
    if (this.fileCache.has(relativePath)) {
      return this.fileCache.get(relativePath);
    }
    if (!this.zip) {
      throw new BM3Error('Zip archive not loaded');
    }
    const entry = this.zip.file(relativePath);
    if (!entry) {
      throw new BM3Error(`Missing file inside archive: ${relativePath}`);
    }
    const data = await entry.async('uint8array');
    this.fileCache.set(relativePath, data);
    return data;
  }
}

function concatUint8Arrays(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function stringToUint8Array(str) {
  return new TextEncoder().encode(str);
}

async function invertNormalGreenChannel(imageBytes, warnings, imageIndex) {
  try {
    if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
      return null;
    }
    const blob = new Blob([imageBytes]);
    const imageBitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i + 1] = 255 - data[i + 1];
    }
    ctx.putImageData(imageData, 0, 0);
    const outputBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!outputBlob) return null;
    const outputBuffer = await outputBlob.arrayBuffer();
    return { bytes: new Uint8Array(outputBuffer), ext: 'png' };
  } catch (exc) {
    const errorMsg = exc instanceof Error ? exc.message : String(exc);
    warnings.warn(
      `Failed to invert green channel of normal map #${imageIndex}: ${errorMsg}. Exporting unchanged.`
    );
    return null;
  }
}

export class GltfBuilder {
  constructor(manifest, binaryBlobs, warnings) {
    this.manifest = manifest;
    this.binaryBlobs = binaryBlobs;
    this.warnings = warnings;
    this.binBlob = new Uint8Array(0);
    this.gltf = {
      asset: {
        version: '2.0',
        generator: `bm3_to_glb.js (from ${manifest.header?.generator || 'BM3'})`,
      },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      buffers: [],
      bufferViews: [],
      accessors: [],
      materials: [],
      textures: [],
      images: [],
    };
    this.extensionsUsed = [];
    this.vertexBufferViewCache = {};
    this.indexBufferViewCache = {};
    this.accessorCache = new Map();
    this.meshCache = new Map();
    this.materialVariantCache = new Map();
    this.baseMaterials = [];
    this.availableUvSets = this._discoverAvailableUvSets();
    this.normalImageIndices = this._discoverNormalImageIndices();
  }

  _discoverAvailableUvSets() {
    const uvSets = new Set();
    const vertexLayouts = this.manifest.vertexLayouts || [];
    for (const layoutsForGeometry of vertexLayouts) {
      for (const layout of layoutsForGeometry) {
        for (const attr of layout) {
          const name = attr.attribute || '';
          if (name.startsWith('TEX_COORD_')) {
            const parts = name.split('_');
            const idx = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(idx)) uvSets.add(idx);
          }
        }
      }
    }
    return uvSets;
  }

  _discoverNormalImageIndices() {
    const imageIndices = new Set();
    const textures = this.manifest.textures || [];
    const materials = this.manifest.materials || [];
    for (const material of materials) {
      const normal = material.normal || {};
      const textureIndex = normal.texture;
      if (textureIndex === undefined || textureIndex === null) continue;
      try {
        const imgIdx = parseInt(textures[parseInt(textureIndex, 10)]['image'], 10);
        if (!isNaN(imgIdx)) imageIndices.add(imgIdx);
      } catch {
        continue;
      }
    }
    return imageIndices;
  }

  _appendBin(data) {
    const offset = this.binBlob.length;
    const paddingLength = (4 - (data.length % 4)) % 4;
    const paddedData =
      paddingLength > 0 ? concatUint8Arrays(data, new Uint8Array(paddingLength)) : data;
    this.binBlob = concatUint8Arrays(this.binBlob, paddedData);
    return [offset, data.length];
  }

  _extractBinarySlice(binaryIndex, byteOffset, byteLength) {
    const blob = this.binaryBlobs[binaryIndex];
    if (!blob) throw new BM3Error(`Binary index ${binaryIndex} is out of range`);
    const end = byteOffset + byteLength;
    if (end > blob.length) {
      throw new BM3Error(
        `Binary slice [${byteOffset}:${end}] exceeds binary #${binaryIndex} size (${blob.length} bytes)`
      );
    }
    return blob.subarray(byteOffset, end);
  }

  copyMeshBuffers() {
    const buffers = this.manifest.buffers || [];
    const geometries = this.manifest.geometries || [];
    const vertexBufferIndices = new Set();
    const indexBufferIndices = new Set();
    const strideByBuffer = {};

    for (const geometry of geometries) {
      const vertexLayoutIndex = geometry.vertexLayout;
      const vertexLayouts = (this.manifest.vertexLayouts || [])[vertexLayoutIndex];
      const vertexBuffers = geometry.vertexBuffers || [];
      for (let slot = 0; slot < vertexBuffers.length; slot++) {
        const bufferIndex = vertexBuffers[slot];
        vertexBufferIndices.add(bufferIndex);
        const stride = vertexLayouts[slot].reduce((sum, attr) => {
          return sum + COMPONENT_SIZE[attr.format] * parseInt(attr.dimension, 10);
        }, 0);
        const existing = strideByBuffer[bufferIndex];
        if (existing !== undefined && existing !== stride) {
          throw new BM3Error(
            `Buffer ${bufferIndex} is used with multiple vertex strides (${existing} and ${stride})`
          );
        }
        strideByBuffer[bufferIndex] = stride;
      }
      if (geometry.indexBuffer !== undefined && geometry.indexBuffer !== null) {
        indexBufferIndices.add(geometry.indexBuffer);
      }
    }

    const sortedIndices = Array.from(
      new Set([...vertexBufferIndices, ...indexBufferIndices])
    ).sort((a, b) => a - b);

    for (const bufferIndex of sortedIndices) {
      const info = buffers[bufferIndex];
      const data = this._extractBinarySlice(info.binary, info.byteOffset, info.byteLength);
      const [offset, length] = this._appendBin(data);
      const bufferView = { buffer: 0, byteOffset: offset, byteLength: length };
      if (vertexBufferIndices.has(bufferIndex)) {
        bufferView.target = 34962;
        bufferView.byteStride = strideByBuffer[bufferIndex];
        this.vertexBufferViewCache[bufferIndex] = this.gltf.bufferViews.length;
      }
      if (indexBufferIndices.has(bufferIndex)) {
        bufferView.target = 34963;
        this.indexBufferViewCache[bufferIndex] = this.gltf.bufferViews.length;
      }
      this.gltf.bufferViews.push(bufferView);
    }
  }

  async addImagesAndTextures() {
    const images = this.manifest.images || [];
    const textures = this.manifest.textures || [];
    for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
      const image = images[imageIndex];
      const rawBytes = this._extractBinarySlice(
        image.binary,
        image.byteOffset,
        image.byteLength
      );
      const [imageBytes, , mime] = await this._prepareImageBytes(
        imageIndex,
        image,
        rawBytes
      );
      const [offset, length] = this._appendBin(imageBytes);
      const bufferViewIndex = this.gltf.bufferViews.length;
      this.gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: length });
      this.gltf.images.push({
        bufferView: bufferViewIndex,
        mimeType: mime,
        name: `image_${imageIndex}`,
      });
    }
    for (const texture of textures) {
      this.gltf.textures.push({ source: texture.image });
    }
  }

  async _prepareImageBytes(imageIndex, image, imageBytes) {
    let ext = (image.format || 'bin').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (this.normalImageIndices.has(imageIndex)) {
      const converted = await invertNormalGreenChannel(imageBytes, this.warnings, imageIndex);
      if (converted !== null) {
        imageBytes = converted.bytes;
        ext = converted.ext;
      }
    }
    const mime = MIMETYPES[ext] || 'application/octet-stream';
    return [imageBytes, ext, mime];
  }

  _normalizeSemantic(bm3Attribute) {
    if (bm3Attribute.startsWith('TEX_COORD_')) {
      const parts = bm3Attribute.split('_');
      return 'TEXCOORD_' + parts[parts.length - 1];
    }
    return bm3Attribute;
  }

  _computeAccessorMinMax(sourceBytes, byteOffset, count, componentFormat, dimension, stride) {
    const mins = Array(dimension).fill(Infinity);
    const maxs = Array(dimension).fill(-Infinity);
    const view = new DataView(
      sourceBytes.buffer,
      sourceBytes.byteOffset,
      sourceBytes.byteLength
    );
    for (let i = 0; i < count; i++) {
      const elementOffset = byteOffset + i * stride;
      for (let j = 0; j < dimension; j++) {
        let val = 0;
        const readOffset = elementOffset + j * COMPONENT_SIZE[componentFormat];
        switch (componentFormat) {
          case 'BYTE':
            val = view.getInt8(readOffset);
            break;
          case 'UNSIGNED_BYTE':
            val = view.getUint8(readOffset);
            break;
          case 'SHORT':
            val = view.getInt16(readOffset, true);
            break;
          case 'UNSIGNED_SHORT':
            val = view.getUint16(readOffset, true);
            break;
          case 'UNSIGNED_INT':
            val = view.getUint32(readOffset, true);
            break;
          case 'FLOAT':
            val = view.getFloat32(readOffset, true);
            break;
        }
        if (val < mins[j]) mins[j] = val;
        if (val > maxs[j]) maxs[j] = val;
      }
    }
    return [mins, maxs];
  }

  _addAccessor(accessor, cacheKey) {
    if (this.accessorCache.has(cacheKey)) return this.accessorCache.get(cacheKey);
    const accessorIndex = this.gltf.accessors.length;
    this.gltf.accessors.push(accessor);
    this.accessorCache.set(cacheKey, accessorIndex);
    return accessorIndex;
  }

  _vertexAccessor(bufferIndex, sourceBytes, count, stride, byteOffset, attr) {
    const componentFormat = attr.format;
    const dimension = parseInt(attr.dimension, 10);
    const semantic = this._normalizeSemantic(attr.attribute);
    const cacheKey = `vertex_${bufferIndex}_${semantic}_${byteOffset}_${count}_${stride}_${componentFormat}_${dimension}`;
    const accessor = {
      bufferView: this.vertexBufferViewCache[bufferIndex],
      byteOffset: byteOffset,
      componentType: GLTF_COMPONENT_TYPE[componentFormat],
      count: count,
      type: DIM_TO_TYPE[dimension],
    };
    if (semantic === 'POSITION') {
      const [mins, maxs] = this._computeAccessorMinMax(
        sourceBytes,
        byteOffset,
        count,
        componentFormat,
        dimension,
        stride
      );
      accessor.min = mins;
      accessor.max = maxs;
    }
    return this._addAccessor(accessor, cacheKey);
  }

  _flippedTexcoordAccessor(bufferIndex, sourceBytes, count, stride, byteOffset, attr) {
    const componentFormat = attr.format;
    const dimension = parseInt(attr.dimension, 10);
    const semantic = this._normalizeSemantic(attr.attribute);
    if (componentFormat !== 'FLOAT') {
      return this._vertexAccessor(
        bufferIndex,
        sourceBytes,
        count,
        stride,
        byteOffset,
        attr
      );
    }
    const cacheKey = `vertex_flipped_v_${bufferIndex}_${semantic}_${byteOffset}_${count}_${stride}_${componentFormat}_${dimension}`;
    if (this.accessorCache.has(cacheKey)) return this.accessorCache.get(cacheKey);
    const view = new DataView(
      sourceBytes.buffer,
      sourceBytes.byteOffset,
      sourceBytes.byteLength
    );
    const packed = new Uint8Array(count * dimension * 4);
    const packedView = new DataView(packed.buffer);
    for (let i = 0; i < count; i++) {
      const elementOffset = byteOffset + i * stride;
      const u = view.getFloat32(elementOffset, true);
      let v = dimension >= 2 ? view.getFloat32(elementOffset + 4, true) : 0;
      if (dimension >= 2) v = 1.0 - v;
      const outOffset = i * dimension * 4;
      packedView.setFloat32(outOffset, u, true);
      if (dimension >= 2) packedView.setFloat32(outOffset + 4, v, true);
      for (let d = 2; d < dimension; d++) {
        packedView.setFloat32(
          outOffset + d * 4,
          view.getFloat32(elementOffset + d * 4, true),
          true
        );
      }
    }
    const [offset, length] = this._appendBin(packed);
    const bufferViewIndex = this.gltf.bufferViews.length;
    this.gltf.bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: length,
      byteStride: COMPONENT_SIZE[componentFormat] * dimension,
      target: 34962,
    });
    const accessor = {
      bufferView: bufferViewIndex,
      byteOffset: 0,
      componentType: GLTF_COMPONENT_TYPE[componentFormat],
      count: count,
      type: DIM_TO_TYPE[dimension],
    };
    return this._addAccessor(accessor, cacheKey);
  }

  _indexAccessor(bufferIndex, start, count, componentFormat) {
    const componentSize = COMPONENT_SIZE[componentFormat];
    const cacheKey = `index_${bufferIndex}_${start}_${count}_${componentFormat}`;
    return this._addAccessor(
      {
        bufferView: this.indexBufferViewCache[bufferIndex],
        byteOffset: start * componentSize,
        componentType: GLTF_COMPONENT_TYPE[componentFormat],
        count: count,
        type: 'SCALAR',
      },
      cacheKey
    );
  }

  buildMaterials() {
    this.baseMaterials = [];
    const mats = this.manifest.materials || [];
    mats.forEach((mat, materialIndex) => {
      const material = { name: mat.name || `material_${materialIndex}` };
      const pbr = {};
      const albedo = mat.albedo || {};
      if (Array.isArray(albedo.value)) {
        pbr.baseColorFactor =
          albedo.value.length === 3
            ? [...albedo.value.map((v) => parseFloat(v)), 1.0]
            : albedo.value.map((v) => parseFloat(v));
      }
      if (albedo.texture !== undefined) pbr.baseColorTexture = this._textureInfo(albedo.texture);
      if (mat.metallic?.value !== undefined) pbr.metallicFactor = parseFloat(mat.metallic.value);
      if (mat.roughness?.value !== undefined) pbr.roughnessFactor = parseFloat(mat.roughness.value);
      if (Object.keys(pbr).length > 0) material.pbrMetallicRoughness = pbr;
      if (mat.normal?.texture !== undefined) material.normalTexture = this._textureInfo(mat.normal.texture);
      if (mat.occlusion?.texture !== undefined) {
        const info = this._textureInfo(mat.occlusion.texture);
        if (mat.occlusion.value !== undefined) info.strength = parseFloat(mat.occlusion.value);
        material.occlusionTexture = info;
      }
      const emissionColor = mat.emissionColor?.value || [0.0, 0.0, 0.0];
      const emissionValue = parseFloat(mat.emissionValue || 0.0);
      if (emissionColor.some((v) => Math.abs(parseFloat(v)) > 1e-8)) {
        const factor = emissionValue > 0.0 ? emissionValue : 1.0;
        const emissive = emissionColor
          .slice(0, 3)
          .map((v) => Math.min(Math.max(parseFloat(v) * factor, 0.0), 1.0));
        if (emissive.some((v) => Math.abs(v) > 1e-8)) material.emissiveFactor = emissive;
      }
      if (mat.cutoutFromAlbedoAlpha) {
        material.alphaMode = 'MASK';
        material.alphaCutoff = 0.5;
      }
      const extensions = {};
      if (mat.ior !== undefined && mat.ior !== null) {
        extensions.KHR_materials_ior = { ior: parseFloat(mat.ior) };
        this._useExtension('KHR_materials_ior');
      }
      if (mat.specular?.value !== undefined || mat.specularTint?.value !== undefined) {
        const ext = {};
        if (mat.specular?.value !== undefined) ext.specularFactor = parseFloat(mat.specular.value);
        if (mat.specularTint?.value !== undefined) {
          ext.specularColorFactor = mat.specularTint.value
            .slice(0, 3)
            .map((v) => parseFloat(v));
        }
        extensions.KHR_materials_specular = ext;
        this._useExtension('KHR_materials_specular');
      }
      if (mat.anisotropy?.value !== undefined && Math.abs(parseFloat(mat.anisotropy.value)) > 1e-8) {
        const ext = { anisotropyStrength: parseFloat(mat.anisotropy.value) };
        if (mat.anisotropyRotation?.value !== undefined) {
          ext.anisotropyRotation = parseFloat(mat.anisotropyRotation.value);
        }
        extensions.KHR_materials_anisotropy = ext;
        this._useExtension('KHR_materials_anisotropy');
      }
      if (Object.keys(extensions).length > 0) material.extensions = extensions;
      this.baseMaterials.push(material);
    });
  }

  _useExtension(name) {
    if (!this.extensionsUsed.includes(name)) this.extensionsUsed.push(name);
  }

  _textureTexcoord(textureIndex) {
    const texture = (this.manifest.textures || [])[textureIndex];
    let texCoord = 0;
    const slot = texture?.mapping?.slot;
    if (typeof slot === 'string' && slot.startsWith('TEX_COORD_')) {
      const parsed = parseInt(slot.split('_').pop() || '0', 10);
      if (!isNaN(parsed)) texCoord = parsed;
    }
    if (!this.availableUvSets.has(texCoord)) {
      texCoord = 0;
    }
    return texCoord;
  }

  _textureInfo(textureIndex) {
    const info = { index: parseInt(String(textureIndex), 10) };
    const texCoord = this._textureTexcoord(info.index);
    if (texCoord) info.texCoord = texCoord;
    return info;
  }

  materialForPrimitive(materialIndex, doubleSided) {
    const cacheKey = `${materialIndex}_${doubleSided}`;
    if (this.materialVariantCache.has(cacheKey)) return this.materialVariantCache.get(cacheKey);
    let material;
    if (materialIndex === null || materialIndex === undefined) {
      if (!doubleSided) {
        this.materialVariantCache.set(cacheKey, null);
        return null;
      }
      material = { name: 'default_double_sided', doubleSided: true };
    } else {
      const baseMat = this.baseMaterials[materialIndex];
      if (!baseMat) {
        throw new BM3Error(`Material references index ${materialIndex}, which does not exist.`);
      }
      material = JSON.parse(JSON.stringify(baseMat));
      if (doubleSided) material.doubleSided = true;
    }
    const gltfIndex = this.gltf.materials.length;
    this.gltf.materials.push(material);
    this.materialVariantCache.set(cacheKey, gltfIndex);
    return gltfIndex;
  }

  _primitiveAttributes(geometry) {
    const vertexLayoutIndex = geometry.vertexLayout;
    const vertexLayouts = (this.manifest.vertexLayouts || [])[vertexLayoutIndex];
    const attributes = {};
    const vertexBuffers = geometry.vertexBuffers || [];
    for (let slot = 0; slot < vertexBuffers.length; slot++) {
      const bufferIndex = vertexBuffers[slot];
      const bufferInfo = (this.manifest.buffers || [])[bufferIndex];
      const sourceBytes = this._extractBinarySlice(
        bufferInfo.binary,
        bufferInfo.byteOffset,
        bufferInfo.byteLength
      );
      const layout = vertexLayouts[slot];
      const stride = layout.reduce(
        (sum, attr) => sum + COMPONENT_SIZE[attr.format] * parseInt(attr.dimension, 10),
        0
      );
      const count = Math.floor(bufferInfo.byteLength / stride);
      let byteOffset = 0;
      for (const attr of layout) {
        const semantic = this._normalizeSemantic(attr.attribute);
        attributes[semantic] = semantic.startsWith('TEXCOORD_')
          ? this._flippedTexcoordAccessor(
              bufferIndex,
              sourceBytes,
              count,
              stride,
              byteOffset,
              attr
            )
          : this._vertexAccessor(
              bufferIndex,
              sourceBytes,
              count,
              stride,
              byteOffset,
              attr
            );
        byteOffset += COMPONENT_SIZE[attr.format] * parseInt(attr.dimension, 10);
      }
    }
    return attributes;
  }

  _geometryPrimitives(geometryIndex, materialIndex) {
    const geometry = (this.manifest.geometries || [])[geometryIndex];
    const attributes = this._primitiveAttributes(geometry);
    const gltfMaterial = this.materialForPrimitive(materialIndex, !!geometry.doubleSided);
    const primitives = [];
    const drawingGroups = geometry.drawingGroups || [{ start: 0, count: 0, mode: 'TRIANGLES' }];
    const indexBuffer = geometry.indexBuffer;
    for (const group of drawingGroups) {
      const mode = PRIMITIVE_MODE[group.mode || 'TRIANGLES'] ?? 4;
      const primitive = { attributes: attributes };
      if (indexBuffer !== undefined && indexBuffer !== null) {
        const componentFormat =
          (this.manifest.buffers || [])[indexBuffer]?.format || 'UNSIGNED_SHORT';
        primitive.indices = this._indexAccessor(
          indexBuffer,
          parseInt(group.start || 0, 10),
          parseInt(group.count || 0, 10),
          componentFormat
        );
      }
      if (mode !== 4) primitive.mode = mode;
      if (gltfMaterial !== null) primitive.material = gltfMaterial;
      primitives.push(primitive);
    }
    return primitives;
  }

  meshForNode(nodeIndex, node) {
    const geometries = node.geometries || [];
    if (!geometries.length) return null;
    const cacheKey = `${geometries.join(',')}_${node.material}`;
    if (this.meshCache.has(cacheKey)) return this.meshCache.get(cacheKey);
    const primitives = [];
    for (const geometryIndex of geometries) {
      primitives.push(...this._geometryPrimitives(geometryIndex, node.material));
    }
    const mesh = { primitives: primitives };
    if (node.name) mesh.name = node.name;
    const meshIndex = this.gltf.meshes.length;
    this.gltf.meshes.push(mesh);
    this.meshCache.set(cacheKey, meshIndex);
    return meshIndex;
  }

  buildNodesAndScene(addSceneConversion) {
    const bm3Nodes = this.manifest.nodes || [];
    bm3Nodes.forEach((bm3Node, nodeIndex) => {
      const gltfNode = {};
      if (bm3Node.name) gltfNode.name = bm3Node.name;
      if (bm3Node.matrix) gltfNode.matrix = bm3Node.matrix.map((v) => parseFloat(v));
      if (bm3Node.children) gltfNode.children = bm3Node.children.map((v) => parseInt(v, 10));
      const meshIndex = this.meshForNode(nodeIndex, bm3Node);
      if (meshIndex !== null) gltfNode.mesh = meshIndex;
      this.gltf.nodes.push(gltfNode);
    });
    const roots = this._rootNodes();
    if (addSceneConversion) {
      const conversionMatrix = this._bm3ToGltfRootMatrix();
      if (conversionMatrix !== null) {
        const conversionNodeIndex = this.gltf.nodes.length;
        this.gltf.nodes.push({
          matrix: conversionMatrix,
          children: roots,
          name: 'BM3_Space_Conversion_Root',
        });
        this.gltf.scenes[0].nodes = [conversionNodeIndex];
        return;
      }
    }
    this.gltf.scenes[0].nodes = roots;
  }

  _rootNodes() {
    const bm3Nodes = this.manifest.nodes || [];
    const childSet = new Set();
    bm3Nodes.forEach((node) => {
      if (node.children) node.children.forEach((c) => childSet.add(parseInt(c, 10)));
    });
    const roots = [];
    for (let i = 0; i < bm3Nodes.length; i++) {
      if (!childSet.has(i)) roots.push(i);
    }
    return roots;
  }

  _bm3ToGltfRootMatrix() {
    const s = UNIT_TO_METERS[(this.manifest.header?.unit || 'm').toLowerCase()] ?? 1.0;
    return [s, 0, 0, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, 0, 0, 1];
  }

  finalizeGltfStructure() {
    if (this.extensionsUsed.length > 0) this.gltf.extensionsUsed = this.extensionsUsed;
    this.gltf.buffers = [{ byteLength: this.binBlob.length }];
    const checkKeys = [
      'textures',
      'images',
      'materials',
      'accessors',
      'bufferViews',
      'meshes',
    ];
    for (const key of checkKeys) {
      if (this.gltf[key] && this.gltf[key].length === 0) delete this.gltf[key];
    }
  }

  generateGlbBuffer() {
    const jsonString = JSON.stringify(this.gltf);
    const jsonPayload = stringToUint8Array(jsonString);
    const jsonPadding = (4 - (jsonPayload.length % 4)) % 4;
    const paddedJsonPayload =
      jsonPadding > 0
        ? concatUint8Arrays(jsonPayload, new Uint8Array(jsonPadding).fill(0x20))
        : jsonPayload;
    const binPadding = (4 - (this.binBlob.length % 4)) % 4;
    const paddedBinBlob =
      binPadding > 0
        ? concatUint8Arrays(this.binBlob, new Uint8Array(binPadding))
        : this.binBlob;
    const totalLength = 12 + 8 + paddedJsonPayload.length + 8 + paddedBinBlob.length;
    const glbBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(glbBuffer);
    const uint8View = new Uint8Array(glbBuffer);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);

    view.setUint32(12, paddedJsonPayload.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    uint8View.set(paddedJsonPayload, 20);

    const binChunkOffset = 20 + paddedJsonPayload.length;
    view.setUint32(binChunkOffset, paddedBinBlob.length, true);
    view.setUint32(binChunkOffset + 4, 0x004e4942, true);
    uint8View.set(paddedBinBlob, binChunkOffset + 8);

    return new Uint8Array(glbBuffer);
  }
}

export async function convertBm3ToGlb(file) {
  const warnings = new WarningLog();
  const source = new BM3Source();
  await source.loadFromFile(file);

  const manifestData = await source.readBytes('manifest.json');
  const manifestText = new TextDecoder().decode(manifestData);
  const manifest = JSON.parse(manifestText);

  const binaryBlobs = [];
  for (let index = 0; index < (manifest.binaries || []).length; index++) {
    const entry = manifest.binaries[index];
    let relPath;
    if (typeof entry === 'string') {
      relPath = entry;
    } else if (entry && typeof entry === 'object') {
      relPath = entry.path || entry.uid || entry.uri || entry.file;
    }
    if (!relPath) {
      throw new BM3Error(`Binaries entry at index ${index} is missing a valid path property.`);
    }
    const blobData = await source.readBytes(relPath);
    binaryBlobs.push(blobData);
  }

  const builder = new GltfBuilder(manifest, binaryBlobs, warnings);
  builder.copyMeshBuffers();
  await builder.addImagesAndTextures();
  builder.buildMaterials();
  builder.buildNodesAndScene(true);
  builder.finalizeGltfStructure();

  const glbBuffer = builder.generateGlbBuffer();
  return new Blob([glbBuffer], { type: 'model/gltf-binary' });
}

export async function convertBm3UrlToGlbBlob(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch BM3 file from URL status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return await convertBm3ToGlb(arrayBuffer);
  } catch (error) {
    console.error('Error processing BM3 URL conversion:', error);
    throw error;
  }
}
