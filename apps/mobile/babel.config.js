// Same as `nativewind/babel` (react-native-css-interop/babel), but the JSX plugin is resolved from
// this package: the preset loads it by name without declaring it, which fails on EAS's install.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: [
      require("react-native-css-interop/dist/babel-plugin").default,
      [
        require.resolve("@babel/plugin-transform-react-jsx"),
        { runtime: "automatic", importSource: "react-native-css-interop" },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
