// Original hollow ring fixture, exported as FBX ASCII 7.4 for loader tests.
export function ringFbx(textureName?: string) {
  const vertices: number[] = [],
    faces: number[] = [],
    uv: number[] = [];
  const n = 24;
  for (const z of [-0.1, 0.1])
    for (const radius of [1, 0.7])
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        vertices.push(Math.cos(a) * radius, Math.sin(a) * radius, z);
      }
  const quad = (a: number, b: number, c: number, d: number) => {
    faces.push(a, b, c, -d - 1);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    quad(i, j, n + j, n + i);
    quad(2 * n + i, 3 * n + i, 3 * n + j, 2 * n + j);
    quad(i, 2 * n + i, 2 * n + j, j);
    quad(n + i, n + j, 3 * n + j, 3 * n + i);
  }
  return `; FBX 7.4.0 project file
FBXHeaderExtension: {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
Objects: {
\tGeometry: 1000, "Geometry::OriginalRing", "Mesh" {
\t\tVertices: *${vertices.length} {
\t\t\ta: ${vertices.join(",")}
\t\t}
\t\tPolygonVertexIndex: *${faces.length} {
\t\t\ta: ${faces.join(",")}
\t\t}
\t\tLayerElementUV: 0 {
\t\t\tVersion: 101
\t\t\tName: "UVMap"
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tUV: *${uv.length} {
\t\t\t\ta: ${uv.join(",")}
\t\t\t}
\t\t}
\t}
\tModel: 2000, "Model::OriginalRing", "Mesh" {
\t\tVersion: 232
\t\tProperties70: {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
\t\t}
\t}
\tMaterial: 3000, "Material::Halo", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tProperties70: {
\t\t\tP: "DiffuseColor", "Color", "", "A",0.4,0.9,1
\t\t\tP: "Opacity", "Number", "", "A",1
\t\t}
\t}
${
  textureName
    ? `\tTexture: 4000, "Texture::Local", "" {
\t\tType: "TextureVideoClip"
\t\tFileName: "${textureName}"
\t}
\tVideo: 5000, "Video::Local", "Clip" {
\t\tFilename: "${textureName}"
\t\tRelativeFilename: "${textureName}"
\t}
`
    : ""
}}
Connections: {
\tC: "OO",1000,2000
\tC: "OO",3000,2000
\tC: "OO",2000,0
${textureName ? '\tC: "OP",4000,3000,"DiffuseColor"\n\tC: "OO",5000,4000\n' : ""}}
`;
}
