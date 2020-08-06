import { Injectable } from '@angular/core';
import { OutletOptions, outletOptionDefaults } from './options';

@Injectable()
export class OptionsResolver {

  constructor() {
  }

  resolve(uo: OutletOptions): OutletOptions {
    const newOptions = JSON.parse(JSON.stringify(outletOptionDefaults));
    if (uo) {
      for (const [optionName, optionValue] of Object.entries(uo)) {
        if (optionName === 'sanitize' && typeof optionValue === 'boolean') { newOptions.sanitize = optionValue; }
        else if (optionName === 'convertHTMLEntities' && typeof optionValue === 'boolean') { newOptions.convertHTMLEntities = optionValue; }
        else if (optionName === 'fixParagraphArtifacts' && typeof optionValue === 'boolean') { newOptions.fixParagraphArtifacts = optionValue; }
        else if (optionName === 'changeDetectionStrategy' && typeof optionValue === 'string') {
          const lower = optionValue.toLowerCase();
          if (lower === 'default' || lower === 'onpush') {
            newOptions.changeDetectionStrategy = optionValue;
          }
        }
        else if (optionName === 'compareInputsByValue' && typeof optionValue === 'boolean') { newOptions.compareInputsByValue = optionValue; }
        else if (optionName === 'compareOutputsByValue' && typeof optionValue === 'boolean') { newOptions.compareOutputsByValue = optionValue; }
        else if (optionName === 'compareByValueDepth' && typeof optionValue === 'number') { newOptions.compareByValueDepth = optionValue; }
        else if (optionName === 'ignoreInputAliases' && typeof optionValue === 'boolean') { newOptions.ignoreInputAliases = optionValue; }
        else if (optionName === 'ignoreOutputAliases' && typeof optionValue === 'boolean') { newOptions.ignoreOutputAliases = optionValue; }
        else if (optionName === 'acceptInputsForAnyProperty' && typeof optionValue === 'boolean') { newOptions.acceptInputsForAnyProperty = optionValue; }
        else if (optionName === 'acceptOutputsForAnyObservable' && typeof optionValue === 'boolean') { newOptions.acceptOutputsForAnyObservable = optionValue; }
        else {
          console.error('Invalid option with name "' + optionName + '" and value ', optionValue);
        }
      }
    }
    return newOptions;
  }
}
