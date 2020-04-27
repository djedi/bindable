/*
Copyright 2020, Verizon Media
Licensed under the terms of the MIT license. See the LICENSE file in the project root for license terms.
*/

export class ListThemeProperties {
    public listThemeCols = [
        {
            _class: 'monospaced',
            colHeadName: 'name',
            colHeadValue: 'Name',
        },
        {
            _class: 'monospaced',
            colHeadName: 'property',
            colHeadValue: 'CSS Property',
        },
        {
            _class: 'monospaced',
            colClass: 't450',
            colHeadName: 'default',
            colHeadValue: 'Main Theme',
        },
    ];

    public listThemeProperties = [
        {
            default: 'var(--c_smoke)',
            name: '--list-color',
            property: 'color',
        },
        {
            default: 'var(--c_subOneMain)',
            name: '--list-color-link',
            property: 'color',
        },
        {
            default: 'var(--c_subOneLight)',
            name: '--list-color-link-hover',
            property: 'color',
        },
    ];
}
