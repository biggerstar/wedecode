import inquirer from "inquirer";

type PromptsOptType = {
  allowAppList: string[],
  requireAppList: string[],
  message?: string
}

const prompts = {
  async default({allowAppList, requireAppList, message}: PromptsOptType) {
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message,
          name: 'allow',
          choices: [
            'all',
            'select',
            'cancel',
          ],
        },
        {
          type: "checkbox",
          message: () => `Please select the name of the micro module you want to operate. \ndefault selected:[ ${requireAppList} ]:`,
          name: "widgets",
          when: (res) => res['allow'] === 'select',
          choices: allowAppList,
          default: requireAppList,
        },
      ]
    )
  },
}
export default prompts
