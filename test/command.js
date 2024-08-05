import inquirer from "inquirer";
import TableInput from "@biggerstar/inquirer-selectable-table";

inquirer.registerPrompt("table", TableInput);

const prompts = {
  scanPack() {
    return inquirer['prompt'](
      [
        {
          type: "table",
          name: "packInfo",
          message: "",
          pageSize: 100,
          columns: [
            {
              name: "firstName",
              value: "firstName"
            },
            {
              name: "lastName",
              value: "lastName"
            },
            {
              name: "location",
              value: "location"
            }
          ],
          rows: [
            {
              firstName: "Abel1111111111111111111111111111111",
              lastName: "Nazeh0000000000000000000000000",
              location: "Nigeria9999999999999999999999999999"
            },
            {
              firstName: "Daniel",
              lastName: "Ruiz",
              location: "Spain"
            },
            {
              firstName: "John",
              lastName: "Doe",
              location: "Leaf Village"
            },
            {
              firstName: "Kakashi",
              lastName: "Hatake",
              location: "Leaf Village"
            },
          ]
        }
      ]
    )
  }
}
prompts.scanPack()
